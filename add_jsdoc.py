#!/usr/bin/env python3
"""
Script to add JSDoc comments to JavaScript functions in voyagr-app.js
Analyzes function signatures and generates appropriate JSDoc comments
"""

import re
import json

def extract_function_info(func_line):
    """Extract function name and parameters from function definition"""
    match = re.search(r'function\s+(\w+)\s*\((.*?)\)', func_line)
    if not match:
        return None, []
    
    func_name = match.group(1)
    params_str = match.group(2).strip()
    
    # Parse parameters
    params = []
    if params_str:
        # Split by comma, but be careful with default values
        param_list = re.split(r',\s*', params_str)
        for param in param_list:
            param = param.strip()
            if '=' in param:
                param = param.split('=')[0].strip()
            if param:
                params.append(param)
    
    return func_name, params

def generate_jsdoc(func_name, params):
    """Generate JSDoc comment for a function"""
    # Create a description based on function name
    desc_map = {
        'calculate': 'Calculate',
        'get': 'Get',
        'set': 'Set',
        'update': 'Update',
        'toggle': 'Toggle',
        'show': 'Show',
        'hide': 'Hide',
        'init': 'Initialize',
        'handle': 'Handle',
        'on': 'Handle',
        'clear': 'Clear',
        'reset': 'Reset',
        'save': 'Save',
        'load': 'Load',
        'delete': 'Delete',
        'remove': 'Remove',
        'add': 'Add',
        'create': 'Create',
        'convert': 'Convert',
        'format': 'Format',
        'validate': 'Validate',
        'check': 'Check',
        'is': 'Check if',
        'has': 'Check if has',
    }
    
    # Find matching prefix
    description = f'{func_name} function'
    for prefix, desc in desc_map.items():
        if func_name.lower().startswith(prefix):
            # Convert camelCase to readable text
            readable = re.sub(r'([a-z])([A-Z])', r'\1 \2', func_name[len(prefix):]).lower()
            description = f'{desc} {readable}' if readable else desc
            break
    
    jsdoc = f'/**\n * {description}\n'
    jsdoc += f' * @function {func_name}\n'
    
    # Add parameters
    for param in params:
        jsdoc += f' * @param {{*}} {param} - Parameter description\n'
    
    jsdoc += ' * @returns {*} Return value description\n'
    jsdoc += ' */\n'
    
    return jsdoc

def process_file(filename):
    """Process JavaScript file and add JSDoc comments"""
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    new_lines = []
    i = 0
    added_count = 0

    while i < len(lines):
        line = lines[i]

        # Check if this is a function definition without JSDoc
        if re.match(r'\s*function\s+\w+\s*\(', line):
            # Check if previous line has JSDoc (look back up to 5 lines)
            has_jsdoc = False
            for j in range(max(0, i-5), i):
                if '/**' in lines[j]:
                    has_jsdoc = True
                    break

            if not has_jsdoc:
                # Extract function info
                func_name, params = extract_function_info(line)
                if func_name:
                    # Generate and add JSDoc
                    jsdoc = generate_jsdoc(func_name, params)
                    new_lines.append(jsdoc)
                    added_count += 1

        new_lines.append(line)
        i += 1

    # Write back to file
    with open(filename, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

    print(f'✅ Added {added_count} JSDoc comments to {filename}')

if __name__ == '__main__':
    process_file('static/js/voyagr-app.js')
    print('✅ JSDoc comments added successfully!')

