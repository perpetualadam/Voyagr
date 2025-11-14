#!/usr/bin/env python3
"""
Fix malformed JSDoc comments in voyagr-app.js
"""

import re

def fix_jsdoc(filename):
    """Fix malformed JSDoc comments"""
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Fix pattern: /** ... */ followed by orphaned lines
    # Pattern: */ followed by lines starting with * but no /**
    
    lines = content.split('\n')
    new_lines = []
    i = 0
    
    while i < len(lines):
        line = lines[i]
        
        # If this line ends a JSDoc block
        if '*/' in line:
            new_lines.append(line)
            i += 1
            
            # Check if next line is an orphaned JSDoc line (starts with * but no /**)
            if i < len(lines) and lines[i].strip().startswith('*') and '/**' not in lines[i]:
                # Skip orphaned lines until we find a function or another JSDoc
                while i < len(lines) and (lines[i].strip().startswith('*') or lines[i].strip() == ''):
                    if '/**' in lines[i] or 'function' in lines[i]:
                        break
                    i += 1
        else:
            new_lines.append(line)
            i += 1
    
    # Write back
    with open(filename, 'w', encoding='utf-8') as f:
        f.write('\n'.join(new_lines))
    
    print(f'✅ Fixed malformed JSDoc comments')
    print(f'✅ File now has {len(new_lines)} lines')

if __name__ == '__main__':
    fix_jsdoc('static/js/voyagr-app.js')

