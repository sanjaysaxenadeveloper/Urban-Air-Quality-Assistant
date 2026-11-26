// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';

const { mocks } = vi.hoisted(() => {
  const mockCurrentUser = {
    uid: 'user-test-uid',
    email: 'test@example.com',
    displayName: 'Test User',
    emailVerified: true,
    getIdToken: vi.fn(async () => 'mock-id-token-12345'),
  };
  return {
    mocks: {
      mockCurrentUser: mockCurrentUser as any,
      authStateListener: null as ((user: any) => void) | null,
      mockDocExists: false,
      mockDocData: {} as any,
    },
  };
});

vi.mock('firebase/auth', () => ({
  getAuth: () => ({
    get currentUser() {
      return mocks.mockCurrentUser;
    },
  }),
  GoogleAuthProvider: vi.fn(),
  onAuthStateChanged: vi.fn((_auth, callback) => {
    mocks.authStateListener = callback;
    callback(mocks.mockCurrentUser);
    return () => {
      mocks.authStateListener = null;
    };
  }),
  signInWithPopup: vi.fn(async () => {}),
  signInWithEmailAndPassword: vi.fn(async () => {}),
  createUserWithEmailAndPassword: vi.fn(async () => ({ user: mocks.mockCurrentUser })),
  sendEmailVerification: vi.fn(async () => {}),
  sendPasswordResetEmail: vi.fn(async () => {}),
  signOut: vi.fn(async () => {
    if (mocks.authStateListener) mocks.authStateListener(null);
  }),
  deleteUser: vi.fn(async () => {}),
  updateProfile: vi.fn(async () => {}),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  doc: vi.fn((_db, coll, id) => ({ path: `${coll}/${id}` })),
  getDoc: vi.fn(async () => ({
    exists: () => mocks.mockDocExists,
    data: () => mocks.mockDocData,
  })),
  setDoc: vi.fn(async () => {}),
  updateDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
  serverTimestamp: () => new Date().toISOString(),
}));

import { AuthProvider, useAuth } from '../src/context/AuthContext.tsx';
import { PreferencesProvider } from '../src/context/PreferencesContext.tsx';
import { AuthModal } from '../src/components/AuthModal.tsx';
import { DEFAULT_ALERT_PREFS, DEFAULT_USER_PROFILE } from '../shared/schemas.ts';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function TestConsumer() {
  const auth = useAuth();
  return (
    <div>
      <div data-testid="authReady">{String(auth.authReady)}</div>
      <div data-testid="user">{auth.user?.email ?? 'none'}</div>
      <div data-testid="status">{auth.authStatusMessage ?? 'none'}</div>
      <div data-testid="locationsCount">{auth.savedLocations.length}</div>
      <button onClick={() => auth.signInWithGoogle()}>Google</button>
      <button onClick={() => auth.signInWithEmail('a@b.com', 'pass123')}>Email</button>
      <button onClick={() => auth.signUpWithEmail('a@b.com', 'pass123', 'Name')}>Signup</button>
      <button onClick={() => auth.sendPasswordReset('a@b.com')}>Reset</button>
      <button onClick={() => auth.resendVerificationEmail()}>Resend</button>
      <button onClick={() => auth.signOutUser()}>SignOut</button>
      <button onClick={() => { void auth.toggleSavedLocation({ id: 'loc-1', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2 }).catch(() => {}); }}>ToggleLoc</button>
      <button onClick={() => { void auth.toggleLocationAlert('loc-1').catch(() => {}); }}>ToggleAlert</button>
      <button onClick={() => { void auth.updateAlertPrefs({ ...DEFAULT_ALERT_PREFS, thresholdAqi: 250 }).catch(() => {}); }}>UpdatePrefs</button>
      <button onClick={() => { void auth.saveFcmToken('fcm-tok-1').catch(() => {}); }}>SaveToken</button>
      <button onClick={() => { void auth.syncNotificationHistory([]).catch(() => {}); }}>SyncNotif</button>
      <button onClick={() => { void auth.exportAccountData().catch(() => {}); }}>Export</button>
      <button onClick={() => { void auth.deleteAccountAndData().catch(() => {}); }}>Delete</button>
      <button onClick={() => auth.clearAuthStatus()}>ClearStatus</button>
      <button onClick={() => { void auth.getIdToken(); }}>GetIdToken</button>
      <button onClick={() => { void auth.syncProfileToCloud({ ...DEFAULT_USER_PROFILE, householdType: 'elderly_care' }).catch(() => {}); }}>SyncProfile</button>
      <button onClick={() => { void auth.syncPreferencesToCloud({ language: 'hi', tempUnit: 'C', aqiScale: 'CPCB', adviceDetail: 'standard', reduceMotion: false, useCurrentLocationOnOpen: true, highContrast: false }).catch(() => {}); }}>SyncPrefs</button>
      <button onClick={() => { void auth.resolveGuestMerge('prefer_guest').catch(() => {}); }}>MergeGuest</button>
      <button onClick={() => { void auth.resolveGuestMerge('prefer_account'); }}>MergeAccount</button>
      <button onClick={() => { void auth.toggleSavedLocation({ id: 'loc-6', name: 'Mumbai', state: 'MH', lat: 19.07, lon: 72.87 }).catch(() => {}); }}>Toggle6th</button>
      <button onClick={() => { void auth.signUpWithEmail('blank@b.com', 'pass123', '   '); }}>SignupBlank</button>
      <button onClick={() => { void auth.toggleSavedLocation({ id: '', name: 'Pune', lat: 18.5, lon: 73.8 }).catch(() => {}); }}>ToggleNoId</button>
    </div>
  );
}

describe('AuthContext and AuthModal 100% Coverage Suite', () => {
  it('throws when useAuth is used outside AuthProvider', () => {
    function BareConsumer() {
      useAuth();
      return null;
    }
    expect(() => render(<BareConsumer />)).toThrow('useAuth must be used within AuthProvider');
  });

  it('renders AuthProvider and initializes with user and new document creation', async () => {
    mocks.mockDocExists = false;
    render(
      <PreferencesProvider>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </PreferencesProvider>
    );

    expect(screen.getByTestId('authReady').textContent).toBe('true');
    expect(screen.getByTestId('user').textContent).toBe('test@example.com');
  });

  it('loads existing user document from cloud', async () => {
    mocks.mockDocExists = true;
    mocks.mockDocData = {
      profile: {
        householdType: 'family_with_kids',
        commuteMode: 'metro',
        airPurifierAtHome: true,
        healthSensitivities: ['asthma'],
      },
      preferences: {
        language: 'hi',
        theme: 'dark',
      },
      savedLocations: [
        { id: 'loc-1', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2, alertsEnabled: true },
      ],
      alertPrefs: {
        ...DEFAULT_ALERT_PREFS,
        thresholdAqi: 220,
      },
      notificationHistory: [],
    };

    render(
      <PreferencesProvider>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </PreferencesProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('locationsCount').textContent).toBe('1');
    });
  });

  it('executes auth actions: sign in, sign up, toggle saved location, alert prefs, fcm token, export, and delete', async () => {
    render(
      <PreferencesProvider>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </PreferencesProvider>
    );

    fireEvent.click(screen.getByText('Google'));
    fireEvent.click(screen.getByText('Email'));
    fireEvent.click(screen.getByText('Signup'));
    fireEvent.click(screen.getByText('Reset'));
    fireEvent.click(screen.getByText('Resend'));
    fireEvent.click(screen.getByText('ToggleLoc'));
    fireEvent.click(screen.getByText('ToggleAlert'));
    fireEvent.click(screen.getByText('UpdatePrefs'));
    fireEvent.click(screen.getByText('SaveToken'));
    fireEvent.click(screen.getByText('SyncNotif'));
    fireEvent.click(screen.getByText('Export'));
    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByText('ClearStatus'));
    fireEvent.click(screen.getByText('SignOut'));
  });

  it('covers AuthModal dialog modes and form interactions', async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <PreferencesProvider>
        <AuthProvider>
          <AuthModal open={false} onClose={onClose} />
        </AuthProvider>
      </PreferencesProvider>
    );

    // Closed mode returns null
    expect(screen.queryByRole('dialog')).toBeNull();

    // Open modal
    rerender(
      <PreferencesProvider>
        <AuthProvider>
          <AuthModal open={true} onClose={onClose} />
        </AuthProvider>
      </PreferencesProvider>
    );

    // Should render dialog
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Test switching tabs: Sign Up
    const createAccountTab = screen.getByRole('button', { name: 'Create account' });
    fireEvent.click(createAccountTab);

    // Fill form and submit sign up
    const nameInput = screen.getByLabelText(/Your name/i);
    const emailInput = screen.getByLabelText(/Email address/i);
    const passInput = screen.getByLabelText(/Password/i);

    fireEvent.change(nameInput, { target: { value: 'Alex' } });
    fireEvent.change(emailInput, { target: { value: 'alex@example.com' } });
    fireEvent.change(passInput, { target: { value: 'Secret123!' } });

    fireEvent.click(screen.getByRole('button', { name: /Create account & send verification/i }));

    // Test mode: reset password
    const resetTab = screen.getByRole('button', { name: 'Reset' });
    fireEvent.click(resetTab);

    const resetSubmitBtn = screen.getByRole('button', { name: /Send password reset email/i });
    fireEvent.click(resetSubmitBtn);

    // Test Escape key closes modal
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();

    // Test Tab and Shift+Tab focus trap
    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    // Test Google Sign-in button in modal
    const googleBtn = screen.getByRole('button', { name: /Continue with Google/i });
    fireEvent.click(googleBtn);

    // Test clicking backdrop outside modal content closes modal
    const backdrop = screen.getByRole('dialog').parentElement!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('covers AuthContext unverified email toggleSavedLocation, syncNotificationHistory error, and requires-recent-login delete', async () => {
    // 1. Unverified user toggleSavedLocation early return
    mocks.mockCurrentUser.emailVerified = false;
    const { authStateListener } = mocks;

    const { unmount } = render(
      <PreferencesProvider>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </PreferencesProvider>
    );

    fireEvent.click(screen.getByText('ToggleLoc'));

    // 2. syncNotificationHistory error catch block (line 477)
    mocks.mockCurrentUser.emailVerified = true;
    const { updateDoc } = await import('firebase/firestore');
    (updateDoc as any).mockRejectedValueOnce(new Error('Firestore sync permission denied'));
    fireEvent.click(screen.getByText('SyncNotif'));
    mocks.mockCurrentUser.emailVerified = false;

    // 3. deleteAccountAndData requires-recent-login branch
    const { deleteUser } = await import('firebase/auth');
    (deleteUser as any).mockRejectedValueOnce(new Error('Firebase: Error (auth/requires-recent-login).'));
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toContain('sign out and sign back in');
    });

    // Reset emailVerified for cleanup
    mocks.mockCurrentUser.emailVerified = true;

    // 4. saveFcmToken with existing tokens and error catch
    const { getDoc } = await import('firebase/firestore');
    (getDoc as any).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ fcmTokens: [{ token: 'old-fcm', platform: 'web', updatedAtIso: '2026-01-01' }] }),
    });
    fireEvent.click(screen.getByText('SaveToken'));

    // 5. saveFcmToken error handling
    (getDoc as any).mockRejectedValueOnce(new Error('FCM token save failed'));
    fireEvent.click(screen.getByText('SaveToken'));

    // 6. deleteAccountAndData generic error branch
    (deleteUser as any).mockRejectedValueOnce(new Error('Generic delete error'));
    fireEvent.click(screen.getByText('Delete'));

    unmount();
  });

  it('covers AuthContext remaining 100% branches and lines', async () => {
    // 1. getIdToken error catch (lines 138-139)
    mocks.mockCurrentUser.getIdToken.mockRejectedValueOnce(new Error('Token fetch failed'));

    // 2. loadUserDocument with unverified user and non-existent doc (line 153)
    mocks.mockCurrentUser.emailVerified = false;
    mocks.mockDocExists = false;

    const { getDoc, updateDoc } = await import('firebase/firestore');

    const { unmount } = render(
      <PreferencesProvider>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </PreferencesProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('authReady').textContent).toBe('true');
    });

    fireEvent.click(screen.getByText('GetIdToken'));

    // 3. Unverified syncProfileToCloud (line 292) & syncPreferencesToCloud (line 306)
    fireEvent.click(screen.getByText('SyncProfile'));
    fireEvent.click(screen.getByText('SyncPrefs'));

    // 4. UpdateDoc errors for syncProfileToCloud (line 300) and syncPreferencesToCloud (line 314)
    mocks.mockCurrentUser.emailVerified = true;
    (updateDoc as any).mockRejectedValueOnce(new Error('Profile sync error'));
    fireEvent.click(screen.getByText('SyncProfile'));

    (updateDoc as any).mockRejectedValueOnce(new Error('Prefs sync error'));
    fireEvent.click(screen.getByText('SyncPrefs'));

    // 5. UpdateDoc errors for toggleSavedLocation (line 394), toggleLocationAlert (line 415), updateAlertPrefs (line 433)
    (updateDoc as any).mockRejectedValueOnce(new Error('Toggle loc error'));
    fireEvent.click(screen.getByText('ToggleLoc'));

    (updateDoc as any).mockRejectedValueOnce(new Error('Toggle alert error'));
    fireEvent.click(screen.getByText('ToggleAlert'));

    (updateDoc as any).mockRejectedValueOnce(new Error('Update prefs error'));
    fireEvent.click(screen.getByText('UpdatePrefs'));

    unmount();

    // 6. loadUserDocument permission error (lines 214-215) and generic error (lines 217-218)
    (getDoc as any).mockRejectedValueOnce(new Error('Missing or insufficient permissions'));
    const rPerm = render(
      <PreferencesProvider>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </PreferencesProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toContain('local cache');
    });
    rPerm.unmount();

    (getDoc as any).mockRejectedValueOnce(new Error('Some other fetch error'));
    const rGeneric = render(
      <PreferencesProvider>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </PreferencesProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toContain('local cache');
    });
    rGeneric.unmount();

    // 7. pendingMerge and resolveGuestMerge (lines 204, 320-350)
    // Customize local guest profile and preferences to trigger hasCustomizedGuestState=true
    window.localStorage.setItem(
      'uaqa_profile_v1',
      JSON.stringify({
        ...DEFAULT_USER_PROFILE,
        householdType: 'elderly_care',
      })
    );
    window.localStorage.setItem(
      'uaqa_preferences_v2',
      JSON.stringify({
        language: 'hi',
        tempUnit: 'F',
        aqiScale: 'EPA',
        adviceDetail: 'concise',
        adviceTone: 'cautious',
        theme: 'dark',
        reduceMotion: false,
        useCurrentLocationOnOpen: true,
        highContrast: false,
      })
    );

    mocks.mockDocExists = true;
    mocks.mockDocData = {
      profile: {
        householdType: 'single_adult',
        healthSensitivities: ['asthma'],
        commuteMode: 'two_wheeler',
        airPurifierAtHome: false,
        outdoorHabits: ['morning_walk'],
      },
      preferences: {
        language: 'en',
        tempUnit: 'C',
        aqiScale: 'CPCB',
        adviceDetail: 'standard',
        adviceTone: 'balanced',
        theme: 'light',
        reduceMotion: false,
        useCurrentLocationOnOpen: true,
        highContrast: false,
      },
      savedLocations: [
        { id: 'loc-1', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2, alertsEnabled: true },
        { id: 'loc-2', name: 'Noida', state: 'UP', lat: 28.5, lon: 77.3, alertsEnabled: true },
        { id: 'loc-3', name: 'Gurugram', state: 'Haryana', lat: 28.4, lon: 77.0, alertsEnabled: true },
        { id: 'loc-4', name: 'Faridabad', state: 'Haryana', lat: 28.4, lon: 77.3, alertsEnabled: true },
        { id: 'loc-5', name: 'Ghaziabad', state: 'UP', lat: 28.6, lon: 77.4, alertsEnabled: true },
      ],
      alertPrefs: DEFAULT_ALERT_PREFS,
      notificationHistory: [],
    };

    const rMerge = render(
      <PreferencesProvider>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </PreferencesProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('authReady').textContent).toBe('true');
    });

    // Click MergeGuest to hit lines 339-345 and line 350
    fireEvent.click(screen.getByText('MergeGuest'));
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toContain('Guest profile and preferences merged');
    });

    // 8. Toggling saved location when length >= 5 (lines 374-375)
    fireEvent.click(screen.getByText('Toggle6th'));
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toContain('up to 5 locations');
    });

    // 9. Toggling saved location when it already exists -> removes it (lines 365-366)
    fireEvent.click(screen.getByText('ToggleLoc'));

    // 10. exportAccountData with valid user (line 481)
    fireEvent.click(screen.getByText('Export'));

    // 11. Trigger remaining AuthContext branches
    // MergeGuest when pendingMerge is already null (line 324)
    fireEvent.click(screen.getByText('MergeGuest'));
    // ToggleAlert with non-matching id (line 411)
    fireEvent.click(screen.getByText('ToggleAlert'));
    // syncNotificationHistory with non-Error rejection (line 479)
    (updateDoc as any).mockRejectedValueOnce('string-sync-err');
    fireEvent.click(screen.getByText('SyncNotif'));

    rMerge.unmount();

    // 12. New doc creation with null email & null displayName (lines 160-161)
    const origUser = mocks.mockCurrentUser;
    mocks.mockCurrentUser = { ...origUser, email: null, displayName: null, emailVerified: true };
    mocks.mockDocExists = false;
    const rNullMeta = render(
      <PreferencesProvider>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </PreferencesProvider>
    );
    await waitFor(() => expect(screen.getByTestId('authReady').textContent).toBe('true'));
    rNullMeta.unmount();

    // 13. Existing doc with invalid profile/savedLocations/alertPrefs/notificationHistory (lines 180, 184, 187, 190) + MergeAccount (338, 353)
    mocks.mockCurrentUser = { ...origUser, emailVerified: true };
    mocks.mockDocExists = true;
    mocks.mockDocData = {
      profile: { bad: true },
      preferences: {},
      savedLocations: 'not-an-array',
      alertPrefs: { thresholdAqi: 'bad' },
      notificationHistory: 'not-an-array',
    };
    const rBadDoc = render(
      <PreferencesProvider>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </PreferencesProvider>
    );
    await waitFor(() => expect(screen.getByTestId('authReady').textContent).toBe('true'));
    fireEvent.click(screen.getByText('MergeAccount'));
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toContain('Loaded your saved account profile');
    });
    fireEvent.click(screen.getByText('SignupBlank'));
    fireEvent.click(screen.getByText('ToggleNoId'));
    rBadDoc.unmount();

    // 14. Unverified calls + deleteAccountAndData unverified & null token (line 517) + null currentUser guards (134, 279, 485, 510)
    mocks.mockCurrentUser = {
      ...origUser,
      emailVerified: false,
      getIdToken: vi.fn().mockRejectedValueOnce(new Error('no token')),
    };
    const rUnv = render(
      <PreferencesProvider>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </PreferencesProvider>
    );
    await waitFor(() => expect(screen.getByTestId('authReady').textContent).toBe('true'));
    fireEvent.click(screen.getByText('ToggleAlert'));
    fireEvent.click(screen.getByText('UpdatePrefs'));
    fireEvent.click(screen.getByText('SaveToken'));
    fireEvent.click(screen.getByText('Delete'));

    // Null currentUser calls
    mocks.mockCurrentUser = null;
    fireEvent.click(screen.getByText('GetIdToken'));
    fireEvent.click(screen.getByText('Resend'));
    fireEvent.click(screen.getByText('SyncNotif'));
    fireEvent.click(screen.getByText('Export'));
    fireEvent.click(screen.getByText('Delete'));

    mocks.mockCurrentUser = origUser;
    rUnv.unmount();
  });
});
