import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-student-notifications',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card">
      <h3>Notifications</h3>
      <p class="muted">Coming soon.</p>
    </div>
  `,
  styles: [`
    .card{background:#fff;padding:12px;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,.06)}
    .muted{color:#64748b}
  `]
})
export class StudentNotificationsComponent {}