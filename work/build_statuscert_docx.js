const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle
} = require('docx');

const inputPath = '/Users/yadvinder.singh/Documents/New project/work/statuscert-template-populated-2444.json';
const outputPath = '/Users/yadvinder.singh/Documents/New project/work/Status Certificate Review - 2444 - Generated.docx';

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const disclaimerParas = (data.disclaimers || []).map((d) =>
  new Paragraph({
    text: d,
    bullet: { level: 0 },
    spacing: { after: 160 }
  })
);

const keyRows = [
  ['Property Unit', data.key_terms?.property_unit || 'N/A'],
  ['Parking Unit', data.key_terms?.parking_unit || 'N/A'],
  ['Locker Unit', data.key_terms?.locker_unit || 'N/A'],
  ['Bike Unit', data.key_terms?.bike_unit || 'N/A'],
  ['Corporation', data.corporation || 'N/A'],
  ['Default for Common Element Fees', data.key_terms?.default_status || 'N/A'],
  ['Common Assessment', data.key_terms?.common_expenses || 'N/A'],
  ['Prepaid Common Expenses', data.key_terms?.prepaid_common_expenses || 'N/A'],
  ['Increases Since Budget', data.key_terms?.increase_since_budget || 'N/A'],
  ['Special Assessment Since Budget', data.key_terms?.special_assessment_since_budget || 'N/A'],
  ['Reserve Fund', data.key_terms?.reserve_fund_balance || 'N/A'],
  ['Reserve Fund Study', data.key_terms?.reserve_fund_study || 'N/A'],
  ['Leased Unit Count', data.key_terms?.leased_unit_count || 'N/A']
];

const infoTable = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: 'Item', heading: HeadingLevel.HEADING_4 })] }),
        new TableCell({ children: [new Paragraph({ text: 'Extracted Value', heading: HeadingLevel.HEADING_4 })] })
      ]
    }),
    ...keyRows.map(([k, v]) =>
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ text: k })] }),
          new TableCell({ children: [new Paragraph({ text: String(v) })] })
        ]
      })
    )
  ]
});

const notesParas = [];
for (const section of data.sections || []) {
  notesParas.push(new Paragraph({ text: section.title || section.key, heading: HeadingLevel.HEADING_2 }));
  notesParas.push(new Paragraph({ text: section.content || '' }));
  if (Array.isArray(section.evidence) && section.evidence.length) {
    notesParas.push(new Paragraph({
      children: [new TextRun({ text: 'Evidence:', bold: true })]
    }));
    for (const ev of section.evidence) {
      notesParas.push(new Paragraph({ text: `- ${ev}` }));
    }
  }
  notesParas.push(new Paragraph({ text: '' }));
}

const doc = new Document({
  sections: [
    {
      children: [
        new Paragraph({
          text: 'Status Certificate Review',
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER
        }),
        new Paragraph({
          text: data.matter || 'Matter',
          alignment: AlignmentType.CENTER
        }),
        new Paragraph({
          text: `*Please note this review is based on a status certificate dated ${data.status_certificate_date || 'N/A'}.`,
          spacing: { before: 200, after: 200 }
        }),
        ...disclaimerParas,
        new Paragraph({ text: '' }),
        new Paragraph({ text: 'Status Certificate Summary', heading: HeadingLevel.HEADING_1 }),
        infoTable,
        new Paragraph({ text: '' }),
        new Paragraph({ text: 'Notes, Rules & Regulations', heading: HeadingLevel.HEADING_1 }),
        ...notesParas,
        new Paragraph({ text: 'Extraction Gaps', heading: HeadingLevel.HEADING_2 }),
        ...(data.extraction_gaps || []).map((g) => new Paragraph({ text: `- ${g}` }))
      ]
    }
  ]
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outputPath, buffer);
  console.log('WROTE', outputPath);
});
