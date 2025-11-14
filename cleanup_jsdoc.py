#!/usr/bin/env python3
"""
Script to clean up duplicate JSDoc comments in voyagr-app.js
"""

import re

def cleanup_duplicates(filename):
    """Remove duplicate JSDoc comments"""
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    new_lines = []
    i = 0
    removed_count = 0
    
    while i < len(lines):
        line = lines[i]
        
        # Check if this is a JSDoc block
        if '/**' in line:
            # Extract the JSDoc block
            jsdoc_lines = [line]
            j = i + 1
            while j < len(lines) and '*/' not in lines[j-1]:
                jsdoc_lines.append(lines[j])
                j += 1
            
            # Check if next JSDoc is identical
            if j < len(lines) and '/**' in lines[j]:
                # Check if the next JSDoc is the same
                next_jsdoc_lines = [lines[j]]
                k = j + 1
                while k < len(lines) and '*/' not in lines[k-1]:
                    next_jsdoc_lines.append(lines[k])
                    k += 1
                
                # Compare
                if jsdoc_lines == next_jsdoc_lines:
                    # Skip the duplicate
                    new_lines.extend(jsdoc_lines)
                    i = k
                    removed_count += 1
                    continue
        
        new_lines.append(line)
        i += 1
    
    # Write back
    with open(filename, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    
    print(f'✅ Removed {removed_count} duplicate JSDoc blocks')
    print(f'✅ File now has {len(new_lines)} lines')

if __name__ == '__main__':
    cleanup_duplicates('static/js/voyagr-app.js')

