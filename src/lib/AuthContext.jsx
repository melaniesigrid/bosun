import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import * as auth from "@/api/auth";

/**
 * Who is signed in.
 *
 * Two failures are kept distinct, because they need different words on screen:
 * `auth_required` means nobody is signed in, and `user_not_registered` means
 * somebody is, but not into this workspace. UserNotRegisteredError renders the
 * second one, and collapsing them would send a member of another workspace to a
 * login page that cannot help them.
 */

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const check = useCallback(async () => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const me = await auth.me();
      setUser(me);
      setIsAuthenticated(true);
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);

      if (error.status === 401) {
        setAuthError({ type: "auth_required", message: "Authentication required" });
      } else if (error.status === 403) {
        setAuthError({
          type: error.data?.error === "user_not_registered" ? "user_not_registered" : "forbidden",
          message: error.message,
        });
      } else {
        // A server that is down must not read as "you are logged out".
        setAuthError({
          type: "unknown",
          message: error.message || "Could not reach the Bosun API.",
        });
      }
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    auth.logout(shouldRedirect ? undefined : window.location.pathname);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        // Kept so App.jsx and the layouts do not have to change. There is no
        // separate app-settings fetch any more; there is only the session.
        isLoadingPublicSettings: false,
        appPublicSettings: null,
        authError,
        authChecked,
        refresh: check,
        logout,
        navigateToLogin: auth.redirectToLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};

export default AuthContext;
