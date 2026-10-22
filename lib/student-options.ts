type DirectoryStudent = {
  id: string;
  studentName?: string;
  guardianName?: string;
  sessionId?: string;
  enrollment?: { id: string; admissionNumber?: string; className?: string; section?: string | null } | null;
};

// The directory API returns applications; attendance, fees and results use enrollment IDs.
export function toEnrollmentStudents(students: DirectoryStudent[]) {
  return students.flatMap(student => student.enrollment ? [{
    ...student.enrollment,
    application: student,
    enrollment: student.enrollment,
  }] : []);
}
