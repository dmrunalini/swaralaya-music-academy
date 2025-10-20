export interface User {
    id: number;
    name: string;
    email: string;
    role: 'student' | 'teacher';
}

export interface Class {
    id: number;
    title: string;
    description: string;
    schedule: string;
    teacherId: number;
}

export interface Material {
    id: number;
    title: string;
    type: 'video' | 'document' | 'audio';
    url: string;
}

export * from './student.model';