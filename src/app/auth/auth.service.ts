import { Injectable, signal } from '@angular/core';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  roleId: number;
  roleName: string;
}

const STORAGE_KEY = 'itsjrgamer_auth_user';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  readonly currentUser = signal<AuthUser | null>(this.readStoredUser());

  isLoggedIn(): boolean {
    return !!this.currentUser();
  }

  isAdmin(): boolean {
    return this.currentUser()?.roleName === 'admin';
  }

  setUser(user: AuthUser): void {
    this.currentUser.set(user);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }

  clearUser(): void {
    this.currentUser.set(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  private readStoredUser(): AuthUser | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const rawUser = localStorage.getItem(STORAGE_KEY);

    if (!rawUser) {
      return null;
    }

    try {
      return JSON.parse(rawUser) as AuthUser;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }
}
