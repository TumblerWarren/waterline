package com.waterline.household;

import com.auth0.android.Auth0;
import com.auth0.android.authentication.AuthenticationException;
import com.auth0.android.authentication.storage.CredentialsManagerException;
import com.auth0.android.authentication.storage.SecureCredentialsManager;
import com.auth0.android.authentication.storage.SharedPreferencesStorage;
import com.auth0.android.callback.Callback;
import com.auth0.android.provider.WebAuthProvider;
import com.auth0.android.result.Credentials;
import com.auth0.android.result.UserProfile;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayDeque;

/** SDK handles PKCE, browser callbacks, renewal and encrypted credential storage. */
@CapacitorPlugin(name = "WaterlineAuth")
public class WaterlineAuthPlugin extends Plugin {
    private Auth0 account;
    private SecureCredentialsManager credentials;
    private String audience;
    private String scheme;
    // Serialize credential operations so a pending refresh cannot undo logout.
    private final ArrayDeque<Runnable> operations = new ArrayDeque<>();
    private boolean running;

    @Override
    public void load() {
        String clientId = getContext().getString(R.string.com_auth0_client_id);
        String domain = getContext().getString(R.string.com_auth0_domain);
        audience = getContext().getString(R.string.com_auth0_audience);
        scheme = getContext().getString(R.string.com_auth0_scheme);
        if (!clientId.isEmpty() && !domain.equals("unconfigured.invalid")) {
            account = Auth0.getInstance(clientId, domain);
            credentials = new SecureCredentialsManager(getContext(), account,
                new SharedPreferencesStorage(getContext()));
            // Old tokens must not be reused after changing client, issuer or API audience.
            android.content.SharedPreferences configuration = getContext()
                .getSharedPreferences("waterline-auth-config", android.content.Context.MODE_PRIVATE);
            String binding = domain + "|" + clientId + "|" + audience;
            if (!binding.equals(configuration.getString("binding", ""))) {
                credentials.clearCredentials();
                configuration.edit().putString("binding", binding).apply();
            }
        }
    }

    private synchronized void enqueue(PluginCall call, Runnable operation) {
        operations.add(() -> {
            try {
                operation.run();
            } catch (RuntimeException error) {
                call.reject("Authentication could not complete. Please try again.", "AUTH_UNAVAILABLE");
                next();
            }
        });
        if (!running) next();
    }

    private synchronized void next() {
        Runnable operation = operations.poll();
        running = operation != null;
        if (operation != null) getActivity().runOnUiThread(operation);
    }

    private boolean ready(PluginCall call) {
        if (account != null) return true;
        call.reject("Sign-in is not configured yet.", "NOT_CONFIGURED");
        next();
        return false;
    }

    private JSObject signedOut() {
        JSObject result = new JSObject();
        result.put("authenticated", false);
        return result;
    }

    private JSObject profile(Credentials value) {
        UserProfile user = value.getUser();
        JSObject result = new JSObject();
        result.put("authenticated", true);
        result.put("name", user.getName());
        result.put("email", user.getEmail());
        result.put("emailVerified", Boolean.TRUE.equals(user.isEmailVerified()));
        return result;
    }

    @PluginMethod
    public void getSession(PluginCall call) {
        enqueue(call, () -> {
            if (account == null || !credentials.hasValidCredentials()) {
                call.resolve(signedOut());
                next();
                return;
            }
            credentials.getCredentials(new Callback<Credentials, CredentialsManagerException>() {
                public void onSuccess(Credentials value) {
                    call.resolve(profile(value));
                    next();
                }
                public void onFailure(CredentialsManagerException error) {
                    // Keep encrypted credentials on network failure so users can retry.
                    call.reject("Unable to restore your session. Check your connection and try again.", "SESSION_UNAVAILABLE");
                    next();
                }
            });
        });
    }

    @PluginMethod
    public void login(PluginCall call) {
        enqueue(call, () -> {
            if (!ready(call)) return;
            WebAuthProvider.Builder builder = WebAuthProvider.login(account)
                .withScheme(scheme).withScope("openid profile email offline_access");
            if (!audience.isEmpty()) builder.withAudience(audience);
            builder.start(getActivity(), new Callback<Credentials, AuthenticationException>() {
                public void onSuccess(Credentials value) {
                    try {
                        credentials.saveCredentials(value);
                        call.resolve(profile(value));
                    } catch (CredentialsManagerException error) {
                        call.reject("Your session could not be stored securely. Please try again.", "STORAGE_FAILED");
                    } finally {
                        next();
                    }
                }
                public void onFailure(AuthenticationException error) {
                    call.reject(error.isAuthenticationCanceled() ? "Sign-in was cancelled." :
                        "Sign-in could not complete. Check your connection and Auth0 settings.", "LOGIN_FAILED");
                    next();
                }
            });
        });
    }

    @PluginMethod
    public void getAccessToken(PluginCall call) {
        enqueue(call, () -> {
            if (!ready(call)) return;
            if (audience.isEmpty()) {
                call.reject("The Waterline API audience is not configured yet.", "API_NOT_CONFIGURED");
                next();
                return;
            }
            credentials.getCredentials(new Callback<Credentials, CredentialsManagerException>() {
                public void onSuccess(Credentials value) {
                    JSObject result = new JSObject();
                    result.put("accessToken", value.getAccessToken());
                    call.resolve(result);
                    next();
                }
                public void onFailure(CredentialsManagerException error) {
                    call.reject("Unable to renew your session. Check your connection or sign in again.", "TOKEN_UNAVAILABLE");
                    next();
                }
            });
        });
    }

    @PluginMethod
    public void logout(PluginCall call) {
        enqueue(call, () -> {
            if (!ready(call)) return;
            credentials.clearCredentials();
            WebAuthProvider.logout(account).withScheme(scheme)
                .start(getActivity(), new Callback<Void, AuthenticationException>() {
                    public void onSuccess(Void value) {
                        call.resolve(signedOut());
                        next();
                    }
                    public void onFailure(AuthenticationException error) {
                        JSObject result = signedOut();
                        result.put("warning", "Signed out on this phone. Browser sign-out did not complete.");
                        call.resolve(result);
                        next();
                    }
                });
        });
    }
}
