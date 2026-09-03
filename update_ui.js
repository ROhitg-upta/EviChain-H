const fs = require('fs');
const path = require('path');

const files = [
  'app/cases/[id]/page.tsx',
  'app/evidence/[id]/page.tsx',
  'app/evidence/new/page.tsx',
  'app/cases/new/page.tsx',
  'app/audit/export/page.tsx',
  'app/audit/[id]/page.tsx'
];

const basePath = 'c:/Users/rohit/OneDrive/Desktop/evichain';

const breadcrumbsMap = {
  'app/cases/[id]/page.tsx': "[{ label: 'Cases', href: '/cases' }, { label: 'Case Detail' }]",
  'app/evidence/[id]/page.tsx': "[{ label: 'Evidence', href: '/evidence' }, { label: 'Evidence Detail' }]",
  'app/evidence/new/page.tsx': "[{ label: 'Evidence', href: '/evidence' }, { label: 'Upload' }]",
  'app/cases/new/page.tsx': "[{ label: 'Cases', href: '/cases' }, { label: 'New Case' }]",
  'app/audit/export/page.tsx': "[{ label: 'Audit', href: '/audit' }, { label: 'Export' }]",
  'app/audit/[id]/page.tsx': "[{ label: 'Audit', href: '/audit' }, { label: 'Event Detail' }]"
};

for (const rel of files) {
  const p = path.join(basePath, rel);
  let content = fs.readFileSync(p, 'utf8');

  // 1. Import WorkspaceShell
  if (!content.includes('WorkspaceShell')) {
    content = content.replace(/(import .*?;)/, '$1\nimport WorkspaceShell from "@/app/components/ui/workspace-shell";');
  }

  // 2. Remove useEffect auth redirect
  content = content.replace(/useEffect\(\(\) => \{\s*if \(!authLoading && !user\) window\.location\.replace\("\/login"\);\s*\}, \[authLoading, user\]\);/g, '');
  content = content.replace(/useEffect\(\(\) => \{\s*if \(!authLoading && !user\) window\.location\.replace\('\/login'\);\s*\}, \[authLoading, user\]\);/g, '');

  // 3. Remove ev-topbar
  content = content.replace(/<header className="ev-topbar">[\s\S]*?<\/header>/g, '');

  // 4. Wrap with WorkspaceShell
  const bc = breadcrumbsMap[rel];
  content = content.replace(/<main className="[^"]+">/g, `<WorkspaceShell breadcrumbs={${bc}} style={{ backgroundColor: 'var(--surface-base)', color: 'var(--text-primary)', minHeight: '100vh' }}>`);
  content = content.replace(/<\/main>/g, `</WorkspaceShell>`);

  // 5. Replace btn classes
  content = content.replace(/button button-primary/g, 'btn btn-primary');
  content = content.replace(/button button-secondary/g, 'btn btn-secondary');
  
  // 6. Add dark inline styles
  content = content.replace(/className="detail-card(.*?)"/g, `className="detail-card$1" style={{ backgroundColor: 'var(--surface-raised)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}`);
  content = content.replace(/className="page-header"/g, `className="page-header" style={{ color: 'var(--text-primary)' }}`);
  content = content.replace(/className="upload-success-card"/g, `className="upload-success-card" style={{ backgroundColor: 'var(--surface-raised)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}`);
  content = content.replace(/className="form-section"/g, `className="form-section" style={{ backgroundColor: 'var(--surface-raised)', borderColor: 'var(--border-default)', color: 'var(--text-primary)', padding: '24px', borderRadius: '8px' }}`);
  content = content.replace(/className="info-section"/g, `className="info-section" style={{ backgroundColor: 'var(--surface-sunken)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)', padding: '24px', borderRadius: '8px' }}`);
  content = content.replace(/className="readonly-banner"/g, `className="readonly-banner" style={{ backgroundColor: 'var(--surface-sunken)', color: 'var(--accent-danger)' }}`);
  
  // hash styling
  content = content.replace(/className="ev-full-hash"/g, `className="ev-full-hash" style={{ fontFamily: 'var(--font-mono)' }}`);
  
  fs.writeFileSync(p, content, 'utf8');
  console.log(`Updated ${rel}`);
}
