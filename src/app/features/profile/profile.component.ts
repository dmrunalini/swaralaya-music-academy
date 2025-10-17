import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService, AppUser, ChildStudent } from '../../core/services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  styles: [`
    .profile-layout { display: grid; gap: 16px; max-width: 900px; margin: 24px auto; }
    .card { background: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 6px 20px rgba(0,0,0,0.08); }
    .section-title { margin: 0 0 12px; }
    form.form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; }
    .full { grid-column: 1 / -1; }
    label { display: flex; flex-direction: column; font-size: 13px; color: #334155; }
    input, select, textarea { margin-top: 6px; padding: 10px 12px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px; background: #fff; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .actions { grid-column: 1 / -1; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .btn { background: #2563eb; color: #fff; border: 0; border-radius: 8px; padding: 10px 16px; cursor: pointer; }
    .btn.ghost { background: transparent; color: #1f2937; border: 1px solid #cbd5e1; }
    .list { border-top: 1px solid #e5e7eb; margin-top: 12px; padding-top: 12px; display: grid; gap: 8px; }
    .item { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; }
    .item h4 { margin: 0; font-size: 15px; }
    .muted { color: #64748b; font-size: 12px; }
    .error { color: #b91c1c; }
    .success { color: #065f46; }
  `],
  template: `
    <div class="profile-layout">
      <!-- Profile -->
      <div class="card">
        <h2 class="section-title">Profile</h2>
        <form class="form" [formGroup]="profileForm" (ngSubmit)="saveProfile()">
          <label>
            Time zone
            <select formControlName="timezone">
              <option value="UTC">UTC</option>
              <option value="Asia/Kolkata">Asia/Kolkata</option>
              <option value="Europe/London">Europe/London</option>
              <option value="America/New_York">America/New_York</option>
            </select>
          </label>
          <label>
            Phone
            <input formControlName="phone" placeholder="+1 555 123 4567" />
          </label>
          <div class="actions">
            <button class="btn" type="submit">Save</button>
            <span class="success" *ngIf="profileMsg">{{ profileMsg }}</span>
          </div>
        </form>
      </div>

      <!-- Children (multiple students under this login) -->
      <div class="card">
        <h3 class="section-title">Students linked to this account</h3>

        <form class="form" [formGroup]="childForm" (ngSubmit)="addChild()">
          <label>
            First name
            <input formControlName="firstName" />
          </label>
          <label>
            Last name
            <input formControlName="lastName" />
          </label>
          <label>
            Age
            <input type="number" formControlName="age" min="1" />
          </label>
          <label>
            Level
            <input formControlName="level" placeholder="Beginner / Intermediate / Advanced" />
          </label>
          <label class="full">
            Notes
            <textarea rows="2" formControlName="notes" placeholder="Any preferences or notes"></textarea>
          </label>
          <label>
            Teacher ID (optional)
            <input formControlName="assignedTeacherId" placeholder="Teacher UID (if known)" />
          </label>
          <label>
            Teacher email (optional)
            <input type="email" formControlName="assignedTeacherEmail" placeholder="teacher@example.com" />
          </label>

          <div class="actions">
            <button class="btn" type="submit" [disabled]="childForm.invalid || childBusy">Add student</button>
            <span class="error" *ngIf="childError">{{ childError }}</span>
          </div>
        </form>

        <div class="list" *ngIf="children.length; else emptyState">
          <div class="item" *ngFor="let s of children">
            <div>
              <h4>{{ s.firstName }} {{ s.lastName }}</h4>
              <div class="muted">
                <span *ngIf="s.age">Age: {{ s.age }} • </span>
                <span *ngIf="s.level">Level: {{ s.level }} • </span>
                <span *ngIf="s.assignedTeacherEmail">Teacher: {{ s.assignedTeacherEmail }}</span>
              </div>
            </div>
            <div class="actions">
              <button class="btn ghost" type="button" (click)="removeChild(s)" [disabled]="childBusy">Remove</button>
            </div>
          </div>
        </div>
        <ng-template #emptyState>
          <p class="muted">No students linked yet. Add your child’s details above.</p>
        </ng-template>
      </div>

      <!-- Change password -->
      <div class="card">
        <h3 class="section-title">Change password</h3>
        <form class="form" [formGroup]="pwForm" (ngSubmit)="changePassword()">
          <label>
            Current password
            <input [type]="hideCurrent ? 'password' : 'text'" formControlName="current" />
          </label>
          <label>
            New password
            <input [type]="hideNew ? 'password' : 'text'" formControlName="newPassword" />
          </label>
          <div class="actions">
            <button class="btn" type="submit" [disabled]="pwForm.invalid || pwBusy">Update password</button>
            <button class="btn ghost" type="button" (click)="toggleShow()">Show/Hide</button>
            <span class="success" *ngIf="pwMessage">{{ pwMessage }}</span>
            <span class="error" *ngIf="pwError">{{ pwError }}</span>
          </div>
        </form>
      </div>
    </div>
  `
})
export class ProfileComponent implements OnInit {
  user: AppUser | null = null;

  profileForm = this.fb.group({
    timezone: ['UTC', Validators.required],
    phone: ['']
  });

  pwForm = this.fb.group({
    current: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(6)]]
  });

  hideCurrent = true;
  hideNew = true;
  pwBusy = false;
  pwMessage = '';
  pwError = '';
  profileMsg = '';

  children: ChildStudent[] = [];
  childBusy = false;
  childError = '';
  childForm = this.fb.group({
    firstName: ['', Validators.required],
    lastName: [''],
    age: [null as number | null],
    level: [''],
    notes: [''],
    assignedTeacherId: [''],
    assignedTeacherEmail: ['']
  });

  constructor(private auth: AuthService, private fb: FormBuilder) {}

  ngOnInit(): void {
    this.auth.user$.subscribe(async u => {
      this.user = u;
      if (u) {
        this.profileForm.patchValue({
          timezone: u.timezone ?? 'UTC',
          phone: u.phone ?? ''
        });
        await this.loadChildren();
      } else {
        this.children = [];
      }
    });
  }

  async loadChildren() {
    if (!this.user) return;
    this.children = await this.auth.listChildStudents(this.user.uid);
  }

  async addChild() {
    if (!this.user || this.childForm.invalid) return;
    this.childBusy = true;
    this.childError = '';
    try {
      const v = this.childForm.value;
      await this.auth.addChildStudent(this.user.uid, {
        firstName: (v.firstName ?? '').toString(),
        lastName: v.lastName ? String(v.lastName) : undefined,
        age: v.age != null ? Number(v.age) : undefined,
        level: v.level ? String(v.level) : undefined,
        notes: v.notes ? String(v.notes) : undefined,
        assignedTeacherId: v.assignedTeacherId ? String(v.assignedTeacherId) : undefined,
        assignedTeacherEmail: v.assignedTeacherEmail ? String(v.assignedTeacherEmail) : undefined
      });
      this.childForm.reset();
      await this.loadChildren();
    } catch (e: any) {
      this.childError = e?.message || 'Could not add student';
    } finally {
      this.childBusy = false;
    }
  }

  async removeChild(s: ChildStudent) {
    if (!this.user || !s.id) return;
    this.childBusy = true;
    try {
      await this.auth.removeChildStudent(this.user.uid, s.id);
      await this.loadChildren();
    } finally {
      this.childBusy = false;
    }
  }

  async saveProfile() {
    if (!this.user) return;
    const uid = this.user.uid;
    const val = this.profileForm.value;
    await this.auth.updateProfile(uid, {
      timezone: val.timezone ?? undefined,
      phone: val.phone ?? undefined
    });
    this.profileMsg = 'Profile saved';
    setTimeout(() => (this.profileMsg = ''), 2000);
  }

  async changePassword() {
    if (this.pwForm.invalid) return;
    this.pwBusy = true; this.pwMessage = ''; this.pwError = '';
    const current = (this.pwForm.get('current')?.value ?? '').toString();
    const newPassword = (this.pwForm.get('newPassword')?.value ?? '').toString();
    try {
      await this.auth.changePassword(current, newPassword);
      this.pwMessage = 'Password updated';
      this.pwForm.reset();
      this.hideCurrent = this.hideNew = true;
      setTimeout(() => (this.pwMessage = ''), 2000);
    } catch (err: any) {
      this.pwError = err?.message || 'Password update failed';
    } finally {
      this.pwBusy = false;
    }
  }

  toggleShow() { this.hideCurrent = !this.hideCurrent; this.hideNew = !this.hideNew; }
}