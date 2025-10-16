import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  public isAuthenticated$ = this.isAuthenticatedSubject.asObservable();

  constructor(private router: Router) {}

  login(username: string, password: string): boolean {
    // Implement login logic here
    // For now, we'll just simulate a successful login
    if (username === 'user' && password === 'password') {
      this.isAuthenticatedSubject.next(true);
      return true;
    }
    return false;
  }

  logout(): void {
    this.isAuthenticatedSubject.next(false);
    this.router.navigate(['/login']);
  }

  isAuthenticated(): boolean {
    return this.isAuthenticatedSubject.value;
  }

  signup(username: string, password: string): boolean {
    // Implement signup logic here
    return true; // Simulate successful signup
  }

  verifyEmail(email: string): boolean {
    // Implement email verification logic here
    return true; // Simulate successful email verification
  }
}