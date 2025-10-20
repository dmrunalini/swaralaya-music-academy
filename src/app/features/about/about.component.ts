import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule],
  template: `<h2>Contact Us</h2><p>Reach out to us.</p>`
})
export class AboutComponent {}