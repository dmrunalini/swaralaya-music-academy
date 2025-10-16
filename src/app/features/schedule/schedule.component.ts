import { Component, OnInit } from '@angular/core';
import { ScheduleService } from './schedule.service';

@Component({
  selector: 'app-schedule',
  templateUrl: './schedule.component.html',
  styleUrls: ['./schedule.component.css']
})
export class ScheduleComponent implements OnInit {
  notifications: string[] = [];
  calendarEvents: any[] = [];

  constructor(private scheduleService: ScheduleService) {}

  ngOnInit(): void {
    this.loadNotifications();
    this.loadCalendarEvents();
  }

  loadNotifications(): void {
    this.scheduleService.getNotifications().subscribe(notifications => {
      this.notifications = notifications;
    });
  }

  loadCalendarEvents(): void {
    this.scheduleService.getCalendarEvents().subscribe(events => {
      this.calendarEvents = events;
    });
  }
}