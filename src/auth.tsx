import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { registerPlugin } from '@capacitor/core';
import { isNative } from './native';

export const authConfigured = Boolean(
  import.meta.env.VITE_AUTH0_DOMAIN &&
  import.meta.env.VITE_AUTH0_CLIENT_ID &&
  (isNative || import.meta.env.VITE_AUTH0_AUDIENCE),
);
interface Session {
  configured: boolean;
  authenticated: boolean;
  loading: boolean;
  error?: string;
  name?: string;
  email?: string;
  emailVerified?: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  token: () => Promise<string>;
}
interface NativeProfile {
  authenticated: boolean;
  name?: string;
  email?: string;
  emailVerified?: boolean;
  warning?: string;
}
interface NativeAuth {
  getSession(): Promise<NativeProfile>;
  login(): Promise<NativeProfile>;
  logout(): Promise<NativeProfile>;
  getAccessToken(): Promise<{ accessToken: string }>;
}
const nativeAuth = registerPlugin<NativeAuth>('WaterlineAuth');
const unavailable = async (): Promise<never> => {
  throw new Error('Sign-in is not configured. Use the installed Android app.');
};
const defaultSession: Session = {
  configured: false,
  authenticated: false,
  loading: false,
  login: unavailable,
  logout: async () => {},
  token: unavailable,
};
const SessionContext = createContext<Session>(defaultSession);

function NativeSession({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<NativeProfile>({ authenticated: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    void nativeAuth
      .getSession()
      .then((value) => {
        if (active) setProfile(value);
      })
      .catch(() => {
        if (active)
          setError('Unable to restore your session. Check your connection or sign in again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const login = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setProfile(await nativeAuth.login());
    } catch (error) {
      setError('Sign-in could not complete. Please try again.');
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);
  const logout = useCallback(async () => {
    setLoading(true);
    try {
      const value = await nativeAuth.logout();
      setProfile(value);
      setError(value.warning);
    } finally {
      setLoading(false);
    }
  }, []);
  const token = useCallback(async () => {
    const { accessToken } = await nativeAuth.getAccessToken();
    if (!accessToken) throw new Error('Please sign in again.');
    return accessToken;
  }, []);
  const value = useMemo<Session>(
    () => ({
      configured: true,
      ...profile,
      loading,
      error,
      login,
      logout,
      token,
    }),
    [profile, loading, error, login, logout, token],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function WebSession({ children }: { children: ReactNode }) {
  const auth = useAuth0();
  const value = useMemo<Session>(
    () => ({
      configured: true,
      authenticated: auth.isAuthenticated,
      loading: auth.isLoading,
      error: auth.error?.message,
      name: auth.user?.name,
      email: auth.user?.email,
      emailVerified: auth.user?.email_verified,
      login: () => auth.loginWithRedirect(),
      logout: () => auth.logout({ logoutParams: { returnTo: window.location.origin } }),
      token: async () => {
        const token = await auth.getAccessTokenSilently();
        if (!token) throw new Error('Please sign in again.');
        return token;
      },
    }),
    [auth],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
export function Authentication({ children }: { children: ReactNode }) {
  if (!authConfigured) return children;
  if (isNative) return <NativeSession>{children}</NativeSession>;
  return (
    <Auth0Provider
      domain={import.meta.env.VITE_AUTH0_DOMAIN}
      clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
      cacheLocation="memory"
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
        scope: 'openid profile email',
      }}
      onRedirectCallback={() => window.history.replaceState({}, '', '/')}
    >
      <WebSession>{children}</WebSession>
    </Auth0Provider>
  );
}
export const useSession = () => useContext(SessionContext);
