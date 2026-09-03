import os
import re

files_info = [
    (r'c:\Users\rohit\OneDrive\Desktop\evichain\app\audit\page.tsx', "[{ label: 'Audit Logs' }]"),
    (r'c:\Users\rohit\OneDrive\Desktop\evichain\app\reports\page.tsx', "[{ label: 'Reports' }]"),
    (r'c:\Users\rohit\OneDrive\Desktop\evichain\app\notifications\page.tsx', "[{ label: 'Notifications' }]"),
    (r'c:\Users\rohit\OneDrive\Desktop\evichain\app\profile\page.tsx', "[{ label: 'Profile' }]"),
    (r'c:\Users\rohit\OneDrive\Desktop\evichain\app\admin\page.tsx', "[{ label: 'Admin' }]"),
    (r'c:\Users\rohit\OneDrive\Desktop\evichain\app\admin\users\page.tsx', "[{ label: 'Admin', href: '/admin' }, { label: 'Users' }]"),
    (r'c:\Users\rohit\OneDrive\Desktop\evichain\app\admin\settings\page.tsx', "[{ label: 'Admin', href: '/admin' }, { label: 'Settings' }]")
]

def process(file_path, breadcrumbs):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    if 'import WorkspaceShell' not in content:
        # insert after last import
        imports = re.findall(r'^import .*?;', content, re.MULTILINE)
        if imports:
            last_import = imports[-1]
            content = content.replace(last_import, last_import + '\nimport WorkspaceShell from "@/app/components/ui/workspace-shell";')

    # Remove Auth Redirect useEffect
    content = re.sub(r'useEffect\(\(\) => \{\s*if \(\!authLoading && \!user\) window\.location\.replace\(.*?\);\s*(if \(\!authLoading && user && user\.role !== "Administrator"\)\s*window\.location\.replace\(.*?\);\s*)?\}, \[authLoading, user\]\);', '', content, flags=re.DOTALL)

    # Remove Topbar
    content = re.sub(r'<header className="ev-topbar">.*?</header>', '', content, flags=re.DOTALL)

    # Replace main tags with WorkspaceShell and inner wrapper
    content = re.sub(r'<main[^>]*>', f'<WorkspaceShell breadcrumbs={{{breadcrumbs}}}>\n<div style={{{{ background: "var(--surface-base)", minHeight: "100%", padding: "24px", color: "var(--text-primary)" }}}}>', content)
    content = re.sub(r'</main>', r'</div>\n</WorkspaceShell>', content)

    # Apply inline styles for dark mode
    content = re.sub(r'className="panel"', r'className="panel" style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "16px" }}', content)
    content = re.sub(r'className="stat-card"', r'className="stat-card" style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "16px", color: "var(--text-primary)" }}', content)
    content = re.sub(r'className="page-header"', r'className="page-header" style={{ marginBottom: "24px" }}', content)
    content = re.sub(r'className="ev-page-sub"', r'className="ev-page-sub" style={{ color: "var(--text-secondary)" }}', content)
    content = re.sub(r'className="eyebrow"', r'className="eyebrow" style={{ color: "var(--text-disabled)", fontFamily: "var(--font-mono)", fontSize: "12px", textTransform: "uppercase" }}', content)
    content = re.sub(r'className="error-message"', r'className="error-message" style={{ color: "var(--accent-danger)", border: "1px solid var(--accent-danger)", background: "rgba(244, 63, 94, 0.1)", padding: "12px", borderRadius: "6px" }}', content)
    content = re.sub(r'<h1(.*?)>', r'<h1\1 style={{ color: "var(--text-primary)", fontSize: "24px", margin: "8px 0" }}>', content)
    content = re.sub(r'<h2(.*?)>', r'<h2\1 style={{ color: "var(--text-primary)", fontSize: "18px", marginBottom: "16px" }}>', content)
    
    # Tables and items
    content = re.sub(r'className="timeline-item"', r'className="timeline-item" style={{ borderBottom: "1px solid var(--border-subtle)", padding: "12px 0" }}', content)
    content = re.sub(r'className="notif-full-item(.*?)"', r'className="notif-full-item\1" style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "16px", marginBottom: "8px" }}', content)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

for fpath, breadcrumbs in files_info:
    process(fpath, breadcrumbs)

print("Done processing files.")
