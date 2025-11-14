#!/usr/bin/env python3
"""
Create a clean version of voyagr-app.js with proper JSDoc comments
"""

import re

def create_clean_version(filename):
    """Create a clean version by removing all JSDoc and re-adding properly"""
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    new_lines = []
    i = 0
    
    while i < len(lines):
        line = lines[i]
        
        # Skip JSDoc blocks
        if '/**' in line:
            # Skip until we find */
            while i < len(lines) and '*/' not in lines[i]:
                i += 1
            i += 1  # Skip the */ line too
            continue
        
        # Skip orphaned JSDoc lines
        if line.strip().startswith('*') and not line.strip().startswith('*/'):
            i += 1
            continue
        
        # If this is a function definition, add JSDoc before it
        if re.match(r'\s*function\s+\w+\s*\(', line):
            # Extract function info
            match = re.search(r'function\s+(\w+)\s*\((.*?)\)', line)
            if match:
                func_name = match.group(1)
                params_str = match.group(2).strip()
                
                # Parse parameters
                params = []
                if params_str:
                    param_list = re.split(r',\s*', params_str)
                    for param in param_list:
                        param = param.strip()
                        if '=' in param:
                            param = param.split('=')[0].strip()
                        if param:
                            params.append(param)
                
                # Generate JSDoc
                jsdoc = f'/**\n * {func_name} function\n'
                jsdoc += f' * @function {func_name}\n'
                for param in params:
                    jsdoc += f' * @param {{*}} {param} - Parameter description\n'
                jsdoc += ' * @returns {*} Return value description\n'
                jsdoc += ' */\n'
                
                new_lines.append(jsdoc)
        
        new_lines.append(line)
        i += 1
    
    # Write back
    with open(filename, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    
    print(f'✅ Created clean version with JSDoc comments')
    print(f'✅ File now has {len(new_lines)} lines')

if __name__ == '__main__':
    create_clean_version('static/js/voyagr-app.js')

