import { Component, OnInit } from '@angular/core';
import { StudentsService } from './students.service';

@Component({
  selector: 'app-students',
  templateUrl: './students.component.html',
  styleUrls: ['./students.component.css']
})
export class StudentsComponent implements OnInit {
  students: any[] = [];

  constructor(private studentsService: StudentsService) {}

  ngOnInit(): void {
    this.loadStudents();
  }

  loadStudents(): void {
    this.studentsService.getStudents().subscribe(data => {
      this.students = data;
    });
  }

  // Additional methods for managing students can be added here
}