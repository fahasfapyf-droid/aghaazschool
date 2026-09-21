# Aghaaz School Student ID Card — Reference Template

Status: **Authoritative existing card design**
Source: `id card.docx` supplied for the Aghaaz School project.
Purpose: preserve the already-issued student ID card design for future system integration.

## Existing card

The source document contains the existing Aghaaz School Student ID Card artwork. It must be treated as the source-of-truth design; do not redesign the card as part of normal system work.

### Front-side fields

- Aghaaz School logo and header
- STUDENT ID CARD
- Name
- GR No.
- Grade
- Shift
- Contact no.
- Address
- Student photo area
- Valid Till: **31st May 2027**

The source document uses four cards per page for printing.

### Reverse side

The source document also contains the existing reverse-side school information/instructions. Preserve it when the printable card is integrated.

## Future system integration

The card should eventually be connected to the permanent Student/Enrollment record.

Planned integration:

1. Populate the existing card fields from the student's Student 360 / Enrollment record.
2. Use the student's GR number as the primary human-readable student identifier.
3. Use the existing student photo where available.
4. Preserve the existing visual layout and validity date for already-issued cards.
5. Future QR attendance may use the existing card without requiring reissue before 31st May 2027.
6. The QR should identify the student through a non-sensitive identifier; do not encode CNIC, guardian phone, address, medical information, or other sensitive data.
7. QR attendance is deferred until the current system QA phase is complete.

## Important

This reference is documentation only at this stage. It does not change the currently issued cards or activate QR attendance.
