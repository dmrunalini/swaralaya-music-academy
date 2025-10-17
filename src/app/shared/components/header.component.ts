import { Component } from '@angular/core';
import { CommonModule, AsyncPipe } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, AsyncPipe],
  template: `
    <aside class="side-nav">
      <div class="brand">Swaralaya Music Academy</div>

      <nav class="nav">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Home</a>

        <ng-container *ngIf="user$ | async as user; else anon">
          <ng-container *ngIf="user.role === 'teacher'; else studentMenu">
            <a routerLink="/teacher" routerLinkActive="active">Dashboard</a>
            <a routerLink="/teacher/profile" routerLinkActive="active">Profile</a>
            <a routerLink="/teacher/materials" routerLinkActive="active">Materials</a>
            <a routerLink="/teacher/students" routerLinkActive="active">Students</a>
            <a routerLink="/teacher/calendar" routerLinkActive="active">Calendar</a>
            <a routerLink="/about" routerLinkActive="active">About</a>
          </ng-container>
          <ng-template #studentMenu>
            <a routerLink="/student" routerLinkActive="active">Dashboard</a>
            <a routerLink="/student/profile" routerLinkActive="active">Profile</a>
            <a routerLink="/student/materials" routerLinkActive="active">Materials</a>
            <a routerLink="/about" routerLinkActive="active">About</a>
          </ng-template>

          <button class="logout" (click)="logout()">Logout</button>
        </ng-container>

        <ng-template #anon>
          <a routerLink="/login" routerLinkActive="active">Sign in</a>
          <a routerLink="/signup" routerLinkActive="active">Sign up</a>
          <a routerLink="/about" routerLinkActive="active">About</a>
        </ng-template>
      </nav>
    </aside>
  `,
  styles: [`
    :host {
      display: block;
      width: 260px;
      flex: 0 0 260px;
    }
    .side-nav {
      position: sticky;
      top: 0;
      height: 100vh;
      box-sizing: border-box;
      background: #0f172a; /* slate-900 */
      color: #e2e8f0;      /* slate-200 */
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .brand {
      font-weight: 700;
      font-size: 20px;
      margin-bottom: 8px;
    }
    .nav {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1 1 auto;
    }
    .nav a {
      color: #e2e8f0;
      text-decoration: none;
      padding: 8px 10px;
      border-radius: 6px;
    }
    .nav a.active, .nav a:hover {
      background: #1e293b; /* slate-800 */
    }
    .logout {
      margin-top: auto;
      background: #dc2626; /* red-600 */
      color: white;
      border: none;
      padding: 8px 10px;
      border-radius: 6px;
      cursor: pointer;
    }
    .logout:hover {
      background: #b91c1c; /* red-700 */
    }
  `]
})
export class HeaderComponent {
  user$ = this.auth.user$;
  constructor(private auth: AuthService, private router: Router) {}
  async logout() {
    await this.auth.signOut();
    await this.router.navigateByUrl('/');
  }
}