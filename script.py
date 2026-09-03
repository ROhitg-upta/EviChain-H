import os
import re

files = [
    r'c:\Users\rohit\OneDrive\Desktop\evichain\app\audit\page.tsx',
    r'c:\Users\rohit\OneDrive\Desktop\evichain\app\reports\page.tsx',
    r'c:\Users\rohit\OneDrive\Desktop\evichain\app\notifications\page.tsx',
    r'c:\Users\rohit\OneDrive\Desktop\evichain\app\profile\page.tsx',
    r'c:\Users\rohit\OneDrive\Desktop\evichain\app\admin\page.tsx',
    r'c:\Users\rohit\OneDrive\Desktop\evichain\app\admin\users\page.tsx',
    r'c:\Users\rohit\OneDrive\Desktop\evichain\app\admin\settings\page.tsx',
]

def process_file(fpath):
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Add import WorkspaceShell
    if 'import WorkspaceShell' not in content:
        lines = content.split('\n')
        for i, line in enumerate(lines):
            if line.startswith('import ') and not lines[i+1].startswith('import '):
                lines.insert(i+1, 'import WorkspaceShell from "@/app/components/ui/workspace-shell";')
                break
        content = '\n'.join(lines)
    
    # 2. Remove manual auth redirect
    content = re.sub(r'useEffect\(\(\) => \{\n\s*if \(\!authLoading && \!user\) window\.location\.replace\("/login"\);\n\s*\}, \[authLoading, user\]\);\n', '', content)
    content = re.sub(r'useEffect\(\(\) => \{\n\s*if \(\!authLoading && \!user\) window\.location\.replace\("/login"\);\n\s*if \(\!authLoading && user && user\.role !== "Administrator"\)\n\s*window\.location\.replace\("/"\);\n\s*\}, \[authLoading, user\]\);\n', '', content)

    # 3. Handle <main ...> and <header> ... Replace them manually or with regex
    # Actually, string replace might be too complex for the JSX since we have to wrap return with <WorkspaceShell> and add inline styles.
    # It's better to just do this by writing the exact new content via tool calls.
    pass

for f in files:
    process_file(f)
