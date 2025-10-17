import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  styles: [`
    .card { max-width: 640px; margin: 24px auto; padding: 24px; background: #fff; border-radius: 12px; box-shadow: 0 6px 24px rgba(0,0,0,0.08); }
    h2 { margin: 0 0 16px; }
    form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; }
    .full { grid-column: 1 / -1; }
    label { display: flex; flex-direction: column; font-size: 13px; color: #334155; }
    input, select { margin-top: 6px; padding: 10px 12px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px; background: #fff; }
    .actions { grid-column: 1 / -1; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    button { background: #2563eb; color: #fff; border: 0; border-radius: 8px; padding: 10px 16px; cursor: pointer; }
    button.ghost { background: transparent; color: #1f2937; border: 1px solid #cbd5e1; }
    button[disabled] { opacity: .6; cursor: not-allowed; }
    .msg { grid-column: 1 / -1; color: #065f46; }
    .warn { color: #b45309; }
  `],
  template: `
    <div class="card" *ngIf="!awaitingVerification; else verifyStep">
      <h2>Create your account</h2>
      <form [formGroup]="form" (ngSubmit)="onSubmit()">
        <label>
          First name
          <input formControlName="name" placeholder="First name" />
        </label>
        <label>
          Last name
          <input formControlName="lastName" placeholder="Last name" />
        </label>

        <label class="full">
          Email
          <input formControlName="email" type="email" placeholder="you@example.com" />
        </label>

        <label>
          Password
          <input formControlName="password" type="password" placeholder="Min 6 characters" />
        </label>
        <label>
          Phone
          <input formControlName="phone" type="tel" placeholder="+1 555 123 4567" />
        </label>

        <label>
          Role
          <select formControlName="role">
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>
        </label>
        <label>
          Gender
          <select formControlName="gender">
            <option value="">--</option>
            <option>male</option>
            <option>female</option>
          </select>
        </label>

        <label>
          Age
          <input type="number" formControlName="age" min="1" />
        </label>
        <label>
          Time zone
          <select formControlName="timezone">
            <option value="UTC">UTC</option>
            <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
            <option value="Europe/London">Europe/London</option>
            <option value="America/New_York">America/New_York</option>
          </select>
        </label>

        <div class="actions">
          <button type="submit" [disabled]="form.invalid || busy">Sign up</button>
          <span class="msg" *ngIf="message">{{ message }}</span>
        </div>

        <div class="full">
          Already have an account?
          <a routerLink="/login">Sign in</a>
        </div>
      </form>
    </div>

    <ng-template #verifyStep>
      <div class="card">
        <h2>Verify your email</h2>
        <p class="warn">
          We sent a verification link to <strong>{{ form.get('email')?.value }}</strong>.
          Please open your email and click the link to verify.
        </p>
        <div class="actions">
          <button class="ghost" type="button" (click)="resend()">Resend email</button>
          <button type="button" (click)="checkNow()">I have verified</button>
          <span class="msg" *ngIf="message">{{ message }}</span>
        </div>
      </div>
    </ng-template>
  `
})
export class SignupComponent {
  form = this.fb.group({
    name: ['', Validators.required],
    lastName: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    phone: ['', [Validators.pattern(/^\+?[0-9\s\-]{7,15}$/)]],
    role: ['student', Validators.required],
    gender: [''],
    age: [null],
    timezone: ['UTC']
  });

  busy = false;
  message = '';
  awaitingVerification = false;
  private pollId: any;

  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router) {}

  async onSubmit() {
    if (this.form.invalid) return;
    this.busy = true;
    this.message = '';

    try {
      const raw = this.form.value;
      const payload = {
        name: (raw.name ?? '').toString(),
        lastName: raw.lastName ? String(raw.lastName) : undefined,
        email: (raw.email ?? '').toString(),
        password: (raw.password ?? '').toString(),
        phone: raw.phone ? String(raw.phone) : undefined,
        role: (raw.role === 'teacher' ? 'teacher' : 'student') as 'teacher' | 'student',
        gender: raw.gender ? String(raw.gender) : undefined,
        age: raw.age != null ? Number(raw.age) : undefined,
        timezone: raw.timezone ? String(raw.timezone) : undefined
      };

      // Create account and send verification (handled in AuthService.signUp)
      await this.auth.signUp(payload);

      // Immediately sign out to keep user non-authenticated until they verify
      await this.auth.signOut();

      // Send them to Login with a helper message via query params
      await this.router.navigate(['/login'], {
        queryParams: { verify: '1', email: payload.email }
      });
    } catch (err: any) {
      this.message = err?.message || 'Signup failed';
    } finally {
      this.busy = false;
    }
  }

  async resend() {
    try {
      await this.auth.resendVerificationEmail();
      this.message = 'Verification email resent.';
    } catch (e: any) {
      this.message = e?.message || 'Could not resend verification email.';
    }
  }

  async checkNow() {
    const verified = await this.auth.checkEmailVerified();
    if (verified) {
      await this.redirectToDashboard();
    } else {
      this.message = 'Email not verified yet. Please click the link in your email.';
    }
  }

  private startVerificationWatcher() {
    this.clearWatcher();
    this.pollId = setInterval(async () => {
      const verified = await this.auth.checkEmailVerified();
      if (verified) {
        this.clearWatcher();
        await this.redirectToDashboard();
      }
    }, 4000);
  }

  private async redirectToDashboard() {
    const user = await this.auth.loadCurrentUser();
    if (user?.role === 'teacher') {
      await this.router.navigate(['/teacher']);
    } else {
      await this.router.navigate(['/student']);
    }
  }

  private clearWatcher() {
    if (this.pollId) {
      clearInterval(this.pollId);
      this.pollId = null;
    }
  }
}