import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile as updateFirebaseAuthProfile,
  type User,
} from 'firebase/auth';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AlertPrefsSchema,
  DEFAULT_ALERT_PREFS,
  DEFAULT_ALERT_STATE,
  DEFAULT_USER_PREFERENCES,
  DEFAULT_USER_PROFILE,
  SavedLocationsListSchema,
  UserProfileSchema,
  mergeGuestWithAccountData,
  migratePreferences,
  type AlertPrefs,
  type FcmTokenEntry,
  type IndianLocation,
  type NotificationItem,
  type SavedLocation,
  type UserPreferences,
  type UserProfile,
} from '../../shared/schemas.ts';
import {
  OperationType,
  auth,
  db,
  googleProvider,
  handleFirestoreError,
} from '../lib/firebase.ts';
import { usePreferences } from './PreferencesContext.tsx';

export interface PendingGuestMerge {
  accountProfile: UserProfile;
  accountPreferences: UserPreferences;
}

export interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  cloudLoaded: boolean;
  sessionExpired: boolean;
  emailVerificationNeeded: boolean;
  savedLocations: SavedLocation[];
  alertPrefs: AlertPrefs;
  cloudNotifications: NotificationItem[];
  pendingMerge: PendingGuestMerge | null;
  authStatusMessage: string | null;
  clearAuthStatus: () => void;
  getIdToken: () => Promise<string | null>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  resolveGuestMerge: (strategy: 'prefer_guest' | 'prefer_account') => Promise<void>;
  syncProfileToCloud: (nextProfile: UserProfile) => Promise<void>;
  syncPreferencesToCloud: (nextPrefs: UserPreferences) => Promise<void>;
  toggleSavedLocation: (loc: IndianLocation) => Promise<void>;
  toggleLocationAlert: (locId: string) => Promise<void>;
  updateAlertPrefs: (next: AlertPrefs) => Promise<void>;
  saveFcmToken: (token: string) => Promise<void>;
  syncNotificationHistory: (items: NotificationItem[]) => Promise<void>;
  exportAccountData: () => Promise<void>;
  deleteAccountAndData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function hasCustomizedGuestState(profile: UserProfile, prefs: UserPreferences): boolean {
  const profileDiffers = JSON.stringify(profile) !== JSON.stringify(DEFAULT_USER_PROFILE);
  const prefsDiffers =
    prefs.language !== DEFAULT_USER_PREFERENCES.language ||
    prefs.tempUnit !== DEFAULT_USER_PREFERENCES.tempUnit ||
    prefs.aqiScale !== DEFAULT_USER_PREFERENCES.aqiScale ||
    prefs.theme !== DEFAULT_USER_PREFERENCES.theme ||
    prefs.adviceDetail !== DEFAULT_USER_PREFERENCES.adviceDetail ||
    prefs.adviceTone !== DEFAULT_USER_PREFERENCES.adviceTone;
  return profileDiffers || prefsDiffers;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { preferences, profile, replacePreferences, updateProfile } = usePreferences();

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [alertPrefs, setAlertPrefs] = useState<AlertPrefs>(DEFAULT_ALERT_PREFS);
  const [cloudNotifications, setCloudNotifications] = useState<NotificationItem[]>([]);
  const [pendingMerge, setPendingMerge] = useState<PendingGuestMerge | null>(null);
  const [authStatusMessage, setAuthStatusMessage] = useState<string | null>(null);

  const hadUserRef = useRef(false);
  const latestGuestProfileRef = useRef(profile);
  const latestGuestPrefsRef = useRef(preferences);

  useEffect(() => {
    latestGuestProfileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    latestGuestPrefsRef.current = preferences;
  }, [preferences]);

  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (!auth.currentUser) return null;
    try {
      return await auth.currentUser.getIdToken();
    } catch {
      setSessionExpired(true);
      return null;
    }
  }, []);

  const loadUserDocument = useCallback(
    async (firebaseUser: User) => {
      const docPath = `users/${firebaseUser.uid}`;
      const userRef = doc(db, 'users', firebaseUser.uid);

      try {
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          // Only create cloud doc when email is verified (enforced by firestore.rules)
          if (!firebaseUser.emailVerified) {
            return;
          }
          const initialProfile = latestGuestProfileRef.current;
          const initialPrefs = latestGuestPrefsRef.current;

          await setDoc(userRef, {
            uid: firebaseUser.uid,
            email: firebaseUser.email ?? '',
            displayName: firebaseUser.displayName ?? '',
            profile: initialProfile,
            preferences: initialPrefs,
            savedLocations: [],
            alertPrefs: DEFAULT_ALERT_PREFS,
            alertState: DEFAULT_ALERT_STATE,
            fcmTokens: [],
            notificationHistory: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          setSavedLocations([]);
          setAlertPrefs(DEFAULT_ALERT_PREFS);
          setCloudNotifications([]);
          setCloudLoaded(true);
          return;
        }

        const data = snap.data() as Record<string, unknown>;
        const cloudProfile = UserProfileSchema.safeParse(data.profile).success
          ? UserProfileSchema.parse(data.profile)
          : DEFAULT_USER_PROFILE;
        const cloudPrefs = migratePreferences(data.preferences);
        const cloudLocs = SavedLocationsListSchema.safeParse(data.savedLocations).success
          ? SavedLocationsListSchema.parse(data.savedLocations)
          : [];
        const cloudAlerts = AlertPrefsSchema.safeParse(data.alertPrefs).success
          ? AlertPrefsSchema.parse(data.alertPrefs)
          : DEFAULT_ALERT_PREFS;
        const history = Array.isArray(data.notificationHistory)
          ? (data.notificationHistory as NotificationItem[])
          : [];

        setSavedLocations(cloudLocs);
        setAlertPrefs(cloudAlerts);
        setCloudNotifications(history);

        // Offer merge on sign-in if guest customized profile/preferences differently from cloud
        if (
          hasCustomizedGuestState(latestGuestProfileRef.current, latestGuestPrefsRef.current) &&
          (JSON.stringify(latestGuestProfileRef.current) !== JSON.stringify(cloudProfile) ||
            JSON.stringify(latestGuestPrefsRef.current) !== JSON.stringify(cloudPrefs))
        ) {
          setPendingMerge({
            accountProfile: cloudProfile,
            accountPreferences: cloudPrefs,
          });
        } else {
          updateProfile(cloudProfile);
          replacePreferences(cloudPrefs);
        }
        setCloudLoaded(true);
      } catch (err) {
        if (err instanceof Error && err.message.includes('Missing or insufficient permissions')) {
          try {
            handleFirestoreError(err, OperationType.GET, docPath);
          } catch {
            // Logged to console by handleFirestoreError, fallback to local cache
          }
        }
        setAuthStatusMessage('Signed in, but cloud sync could not load right now. Using local cache.');
        setCloudLoaded(false);
      }
    },
    [replacePreferences, updateProfile]
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        hadUserRef.current = true;
        setSessionExpired(false);
        setUser(firebaseUser);
        setAuthReady(true);
        setCloudLoaded(false);
        void loadUserDocument(firebaseUser);
      } else {
        setUser(null);
        setCloudLoaded(false);
        setSavedLocations([]);
        setAlertPrefs(DEFAULT_ALERT_PREFS);
        setCloudNotifications([]);
        setPendingMerge(null);
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, [loadUserDocument]);

  const signInWithGoogle = useCallback(async () => {
    setSessionExpired(false);
    setAuthStatusMessage(null);
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setSessionExpired(false);
    setAuthStatusMessage(null);
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const signUpWithEmail = useCallback(
    async (email: string, password: string, displayName: string) => {
      setSessionExpired(false);
      setAuthStatusMessage(null);
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (displayName.trim()) {
        await updateFirebaseAuthProfile(cred.user, { displayName: displayName.trim().slice(0, 80) });
      }
      await sendEmailVerification(cred.user);
      setAuthStatusMessage(
        'Account created! Please check your inbox and verify your email to enable cloud sync.'
      );
    },
    []
  );

  const resendVerificationEmail = useCallback(async () => {
    if (!auth.currentUser) return;
    await sendEmailVerification(auth.currentUser);
    setAuthStatusMessage('Verification email resent. After clicking the link, refresh the page.');
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const signOutUser = useCallback(async () => {
    hadUserRef.current = false;
    setSessionExpired(false);
    await signOut(auth);
  }, []);

  const syncProfileToCloud = useCallback(async (nextProfile: UserProfile) => {
    const u = auth.currentUser;
    if (!u || !u.emailVerified) return;
    const path = `users/${u.uid}`;
    try {
      await updateDoc(doc(db, 'users', u.uid), {
        profile: nextProfile,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }, []);

  const syncPreferencesToCloud = useCallback(async (nextPrefs: UserPreferences) => {
    const u = auth.currentUser;
    if (!u || !u.emailVerified) return;
    const path = `users/${u.uid}`;
    try {
      await updateDoc(doc(db, 'users', u.uid), {
        preferences: nextPrefs,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }, []);

  const resolveGuestMerge = useCallback(
    async (strategy: 'prefer_guest' | 'prefer_account') => {
      if (!pendingMerge) return;
      const merged = mergeGuestWithAccountData({
        guestProfile: latestGuestProfileRef.current,
        guestPreferences: latestGuestPrefsRef.current,
        accountProfile: pendingMerge.accountProfile,
        accountPreferences: pendingMerge.accountPreferences,
        strategy,
      });

      updateProfile(merged.profile);
      replacePreferences(merged.preferences);
      setPendingMerge(null);

      const u = auth.currentUser;
      if (u && u.emailVerified && strategy === 'prefer_guest') {
        const path = `users/${u.uid}`;
        try {
          await updateDoc(doc(db, 'users', u.uid), {
            profile: merged.profile,
            preferences: merged.preferences,
            updatedAt: serverTimestamp(),
          });
        }
        /* v8 ignore next 3 */
        catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }
      }
      setAuthStatusMessage(
        strategy === 'prefer_guest'
          ? 'Guest profile and preferences merged into your account.'
          : 'Loaded your saved account profile and preferences.'
      );
    },
    [pendingMerge, replacePreferences, updateProfile]
  );

  const toggleSavedLocation = useCallback(
    async (loc: IndianLocation) => {
      const u = auth.currentUser;
      if (!u || !u.emailVerified) return;
      const locId = loc.id || `${loc.name.toLowerCase().replace(/\s+/g, '-')}-${loc.lat.toFixed(2)}`;
      const exists = savedLocations.some(
        (s) => s.id === locId || s.name.toLowerCase() === loc.name.toLowerCase()
      );
      let next: SavedLocation[];
      if (exists) {
        next = savedLocations.filter(
          (s) => s.id !== locId && s.name.toLowerCase() !== loc.name.toLowerCase()
        );
      } else {
        if (savedLocations.length >= 5) {
          setAuthStatusMessage('You can save up to 5 locations. Remove one first to add another.');
          return;
        }
        next = [
          ...savedLocations,
          {
            id: locId,
            name: loc.name,
            state: loc.state ?? '',
            lat: loc.lat,
            lon: loc.lon,
            alertsEnabled: true,
          },
        ];
      }

      setSavedLocations(next);
      const path = `users/${u.uid}`;
      try {
        await updateDoc(doc(db, 'users', u.uid), {
          savedLocations: next,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [savedLocations]
  );

  const toggleLocationAlert = useCallback(
    async (locId: string) => {
      const u = auth.currentUser;
      if (!u || !u.emailVerified) return;
      const next = savedLocations.map((loc) =>
        loc.id === locId ? { ...loc, alertsEnabled: !loc.alertsEnabled } : loc
      );
      setSavedLocations(next);
      const path = `users/${u.uid}`;
      try {
        await updateDoc(doc(db, 'users', u.uid), {
          savedLocations: next,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [savedLocations]
  );

  const updateAlertPrefs = useCallback(async (next: AlertPrefs) => {
    const valid = AlertPrefsSchema.parse(next);
    setAlertPrefs(valid);
    const u = auth.currentUser;
    if (!u || !u.emailVerified) return;
    const path = `users/${u.uid}`;
    try {
      await updateDoc(doc(db, 'users', u.uid), {
        alertPrefs: valid,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }, []);

  const saveFcmToken = useCallback(async (token: string) => {
    const u = auth.currentUser;
    if (!u || !u.emailVerified) return;
    const path = `users/${u.uid}`;
    try {
      const snap = await getDoc(doc(db, 'users', u.uid));
      const existingTokens =
        snap.exists() && Array.isArray(snap.data().fcmTokens)
          ? (snap.data().fcmTokens as FcmTokenEntry[])
          : [];
      const nextTokens: FcmTokenEntry[] = [
        ...existingTokens.filter((entry) => entry.token !== token),
        { token, platform: 'web', updatedAtIso: new Date().toISOString() },
      ].slice(-10);

      await updateDoc(doc(db, 'users', u.uid), {
        fcmTokens: nextTokens,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }, []);

  const syncNotificationHistory = useCallback(async (items: NotificationItem[]) => {
    const capped = items.slice(0, 50);
    setCloudNotifications(capped);
    const u = auth.currentUser;
    if (!u || !u.emailVerified) return;
    const path = `users/${u.uid}`;
    try {
      await updateDoc(doc(db, 'users', u.uid), {
        notificationHistory: capped,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('Background notification sync failed:', path, err instanceof Error ? err.message : 'Unknown error');
    }
  }, []);

  const exportAccountData = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      account: {
        uid: u.uid,
        email: u.email,
        displayName: u.displayName,
        profile: latestGuestProfileRef.current,
        preferences: latestGuestPrefsRef.current,
        savedLocations,
        alertPrefs,
        notificationHistory: cloudNotifications,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `urban-air-account-${u.uid.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [alertPrefs, cloudNotifications, savedLocations]);

  const deleteAccountAndData = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) return;
    const token = await getIdToken();
    const path = `users/${u.uid}`;
    try {
      if (u.emailVerified) {
        await deleteDoc(doc(db, 'users', u.uid));
      }
      if (token) {
        await fetch('/api/user/account', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
      await deleteUser(u);
      setAuthStatusMessage('Your account and stored data have been permanently deleted.');
    } catch (err) {
      if (err instanceof Error && err.message.includes('requires-recent-login')) {
        setAuthStatusMessage(
          'For security, please sign out and sign back in once before deleting your account.'
        );
        return;
      }
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }, [getIdToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      authReady,
      cloudLoaded,
      sessionExpired,
      emailVerificationNeeded: Boolean(user && !user.emailVerified),
      savedLocations,
      alertPrefs,
      cloudNotifications,
      pendingMerge,
      authStatusMessage,
      clearAuthStatus: () => setAuthStatusMessage(null),
      getIdToken,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      resendVerificationEmail,
      sendPasswordReset,
      signOutUser,
      resolveGuestMerge,
      syncProfileToCloud,
      syncPreferencesToCloud,
      toggleSavedLocation,
      toggleLocationAlert,
      updateAlertPrefs,
      saveFcmToken,
      syncNotificationHistory,
      exportAccountData,
      deleteAccountAndData,
    }),
    [
      user,
      authReady,
      cloudLoaded,
      sessionExpired,
      savedLocations,
      alertPrefs,
      cloudNotifications,
      pendingMerge,
      authStatusMessage,
      getIdToken,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      resendVerificationEmail,
      sendPasswordReset,
      signOutUser,
      resolveGuestMerge,
      syncProfileToCloud,
      syncPreferencesToCloud,
      toggleSavedLocation,
      toggleLocationAlert,
      updateAlertPrefs,
      saveFcmToken,
      syncNotificationHistory,
      exportAccountData,
      deleteAccountAndData,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
