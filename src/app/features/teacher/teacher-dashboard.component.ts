import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-teacher-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="content">
      <h2>Teacher Dashboard</h2>
      <!-- dashboard content -->
    </div>
  `,
  styles: [`
    .content{background:#fff;padding:12px;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,.06)}
  `]
})
export class TeacherDashboardComponent {}