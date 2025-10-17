import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  styles: [`
    .signin { max-width: 480px; margin: 24px auto; background: #fff; padding: 24px; border-radius: 12px; box-shadow: 0 6px 24px rgba(0,0,0,0.08); }
    form { display: grid; gap: 12px; }
    label { display: flex; flex-direction: column; font-size: 13px; color: #334155; }
    input { margin-top: 6px; padding: 10px 12px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px; }
    button { background: #2563eb; color: #fff; border: 0; border-radius: 8px; padding: 10px 16px; cursor: pointer; }
    button[disabled] { opacity: .6; cursor: not-allowed; }
    .ghost { background: transparent; color: #1f2937; border: 1px solid #cbd5e1; }
    .actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
    .msg { color: #b45309; }
  `],
  template: `
    <div class="signin">
      <h2>Sign in</h2>

      <div class="actions" *ngIf="prefillVerifyNotice">
        <span class="msg">We sent a verification link to your email. Please verify, then sign in.</span>
      </div>

      <form [formGroup]="form" (ngSubmit)="onSubmit()">
        <label>Email <input formControlName="email" type="email" /></label>
        <label>Password <input formControlName="password" type="password" /></label>
        <div class="actions">
          <button type="submit" [disabled]="form.invalid || busy">Sign in</button>
          <a routerLink="/signup">Create an account</a>
        </div>
      </form>

      <div class="actions" *ngIf="awaitingVerification">
        <span class="msg">Please verify your email. Check your inbox for the verification link.</span>
        <button type="button" class="ghost" (click)="resend()" [disabled]="busy">Resend email</button>
      </div>

      <div class="msg" *ngIf="message">{{ message }}</div>
    </div>
  `
})
export class LoginComponent implements OnInit {
  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });
  busy = false;
  message = '';
  awaitingVerification = false;
  prefillVerifyNotice = false;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    // If redirected from signup, prefill email and show verify notice
    const qp = this.route.snapshot.queryParamMap;
    const email = qp.get('email');
    const verify = qp.get('verify');
    if (email) this.form.get('email')?.setValue(email);
    if (verify === '1') {
      this.prefillVerifyNotice = true;
    }
  }

  async onSubmit() {
    if (this.form.invalid) return;
    this.busy = true;
    this.message = '';
    this.awaitingVerification = false;

    try {
      const email = (this.form.get('email')?.value ?? '').toString();
      const password = (this.form.get('password')?.value ?? '').toString();
      if (!email || !password) {
        this.message = 'Email and password are required';
        return;
      }

      await this.auth.signIn(email, password);

      // Require verified email before routing
      const verified = await this.auth.checkEmailVerified();
      if (!verified) {
        this.awaitingVerification = true;
        this.message = 'Please verify your email to continue.';
        return;
      }

      const user = await this.auth.loadCurrentUser();
      if (user?.role === 'teacher') {
        await this.router.navigate(['/teacher']);
      } else {
        await this.router.navigate(['/student']);
      }
    } catch (err: any) {
      this.message = err?.message || 'Sign in failed';
    } finally {
      this.busy = false;
    }
  }

  async resend() {
    this.busy = true;
    this.message = '';
    try {
      await this.auth.resendVerificationEmail();
      this.message = 'Verification email resent.';
    } catch (e: any) {
      this.message = e?.message || 'Could not resend verification email.';
    } finally {
      this.busy = false;
    }
  }
}