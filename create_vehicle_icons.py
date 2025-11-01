#!/usr/bin/env python3
"""
Create vehicle location icons for Voyagr satellite navigation app.
Generates PNG icons for different vehicle types and routing modes.
"""

import os
from PIL import Image, ImageDraw

def create_car_icon(size=64, color=(0, 100, 200)):
    """Create a car icon pointing upward."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Car body (pointing up)
    margin = size // 8
    body_top = margin + 5
    body_bottom = size - margin - 5
    body_left = margin + 10
    body_right = size - margin - 10
    
    # Main body
    draw.rectangle([body_left, body_top + 10, body_right, body_bottom - 5], fill=color, outline=(0, 0, 0), width=2)
    
    # Cabin (top part)
    cabin_left = body_left + 5
    cabin_right = body_right - 5
    cabin_top = body_top
    cabin_bottom = body_top + 15
    draw.rectangle([cabin_left, cabin_top, cabin_right, cabin_bottom], fill=color, outline=(0, 0, 0), width=2)
    
    # Front point (arrow)
    points = [(size // 2, margin), (body_left, body_top + 10), (body_right, body_top + 10)]
    draw.polygon(points, fill=color, outline=(0, 0, 0))
    
    # Windows
    window_color = (100, 150, 255)
    draw.rectangle([cabin_left + 2, cabin_top + 2, cabin_left + 8, cabin_bottom - 2], fill=window_color)
    draw.rectangle([cabin_right - 8, cabin_top + 2, cabin_right - 2, cabin_bottom - 2], fill=window_color)
    
    return img

def create_electric_icon(size=64, color=(0, 200, 100)):
    """Create an electric vehicle icon with lightning bolt."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # EV body (similar to car but green)
    margin = size // 8
    body_top = margin + 5
    body_bottom = size - margin - 5
    body_left = margin + 10
    body_right = size - margin - 10
    
    # Main body
    draw.rectangle([body_left, body_top + 10, body_right, body_bottom - 5], fill=color, outline=(0, 0, 0), width=2)
    
    # Cabin
    cabin_left = body_left + 5
    cabin_right = body_right - 5
    cabin_top = body_top
    cabin_bottom = body_top + 15
    draw.rectangle([cabin_left, cabin_top, cabin_right, cabin_bottom], fill=color, outline=(0, 0, 0), width=2)
    
    # Front point
    points = [(size // 2, margin), (body_left, body_top + 10), (body_right, body_top + 10)]
    draw.polygon(points, fill=color, outline=(0, 0, 0))
    
    # Lightning bolt (yellow)
    bolt_x = size // 2
    bolt_y = size // 2
    bolt_points = [
        (bolt_x, bolt_y - 8),
        (bolt_x - 3, bolt_y - 2),
        (bolt_x + 2, bolt_y - 2),
        (bolt_x - 2, bolt_y + 8),
        (bolt_x + 3, bolt_y + 2),
        (bolt_x - 2, bolt_y + 2),
    ]
    draw.polygon(bolt_points, fill=(255, 255, 0), outline=(255, 200, 0), width=1)
    
    return img

def create_motorcycle_icon(size=64, color=(200, 100, 0)):
    """Create a motorcycle icon."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Wheels (circles)
    wheel_radius = 6
    front_wheel_x = size // 3
    rear_wheel_x = 2 * size // 3
    wheel_y = size - 15
    
    draw.ellipse([front_wheel_x - wheel_radius, wheel_y - wheel_radius, 
                  front_wheel_x + wheel_radius, wheel_y + wheel_radius], 
                 outline=(0, 0, 0), width=2)
    draw.ellipse([rear_wheel_x - wheel_radius, wheel_y - wheel_radius, 
                  rear_wheel_x + wheel_radius, wheel_y + wheel_radius], 
                 outline=(0, 0, 0), width=2)
    
    # Frame
    draw.line([(front_wheel_x, wheel_y), (size // 2, 15)], fill=color, width=3)
    draw.line([(size // 2, 15), (rear_wheel_x, wheel_y)], fill=color, width=3)
    
    # Seat
    draw.ellipse([size // 2 - 8, 12, size // 2 + 8, 20], fill=color, outline=(0, 0, 0), width=1)
    
    # Handlebars
    draw.line([(size // 2 - 5, 10), (size // 2 + 5, 10)], fill=(0, 0, 0), width=2)
    
    # Front point (arrow)
    points = [(size // 2, 5), (size // 2 - 4, 12), (size // 2 + 4, 12)]
    draw.polygon(points, fill=color, outline=(0, 0, 0))
    
    return img

def create_truck_icon(size=64, color=(150, 100, 50)):
    """Create a truck icon."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Cab (front)
    cab_left = size // 4
    cab_right = size // 2 + 5
    cab_top = 15
    cab_bottom = 35
    draw.rectangle([cab_left, cab_top, cab_right, cab_bottom], fill=color, outline=(0, 0, 0), width=2)
    
    # Cargo bed (back)
    cargo_left = cab_right - 2
    cargo_right = size - 10
    cargo_top = 18
    cargo_bottom = 35
    draw.rectangle([cargo_left, cargo_top, cargo_right, cargo_bottom], fill=(100, 80, 40), outline=(0, 0, 0), width=2)
    
    # Wheels
    wheel_radius = 5
    front_wheel_y = 40
    rear_wheel_y = 40
    
    draw.ellipse([cab_left + 5 - wheel_radius, front_wheel_y - wheel_radius, 
                  cab_left + 5 + wheel_radius, front_wheel_y + wheel_radius], 
                 outline=(0, 0, 0), width=2)
    draw.ellipse([cargo_right - 5 - wheel_radius, rear_wheel_y - wheel_radius, 
                  cargo_right - 5 + wheel_radius, rear_wheel_y + wheel_radius], 
                 outline=(0, 0, 0), width=2)
    
    # Front point
    points = [(size // 2, 8), (cab_left, cab_top), (cab_left, cab_bottom)]
    draw.polygon(points, fill=color, outline=(0, 0, 0))
    
    return img

def create_van_icon(size=64, color=(100, 150, 200)):
    """Create a van icon."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Van body
    body_left = 12
    body_right = size - 12
    body_top = 15
    body_bottom = 40
    
    draw.rectangle([body_left, body_top, body_right, body_bottom], fill=color, outline=(0, 0, 0), width=2)
    
    # Cabin window
    draw.rectangle([body_left + 3, body_top + 2, body_left + 12, body_top + 12], fill=(100, 150, 255))
    
    # Side windows
    draw.rectangle([body_left + 15, body_top + 2, body_left + 22, body_top + 12], fill=(100, 150, 255))
    draw.rectangle([body_left + 25, body_top + 2, body_left + 32, body_top + 12], fill=(100, 150, 255))
    
    # Wheels
    wheel_radius = 5
    front_wheel_x = body_left + 8
    rear_wheel_x = body_right - 8
    wheel_y = 45
    
    draw.ellipse([front_wheel_x - wheel_radius, wheel_y - wheel_radius, 
                  front_wheel_x + wheel_radius, wheel_y + wheel_radius], 
                 outline=(0, 0, 0), width=2)
    draw.ellipse([rear_wheel_x - wheel_radius, wheel_y - wheel_radius, 
                  rear_wheel_x + wheel_radius, wheel_y + wheel_radius], 
                 outline=(0, 0, 0), width=2)
    
    # Front point
    points = [(size // 2, 8), (body_left, body_top), (body_left, body_bottom)]
    draw.polygon(points, fill=color, outline=(0, 0, 0))
    
    return img

def create_bicycle_icon(size=64, color=(200, 50, 50)):
    """Create a bicycle icon."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Wheels
    wheel_radius = 7
    front_wheel_x = size // 3
    rear_wheel_x = 2 * size // 3
    wheel_y = size - 12
    
    draw.ellipse([front_wheel_x - wheel_radius, wheel_y - wheel_radius, 
                  front_wheel_x + wheel_radius, wheel_y + wheel_radius], 
                 outline=(0, 0, 0), width=2)
    draw.ellipse([rear_wheel_x - wheel_radius, wheel_y - wheel_radius, 
                  rear_wheel_x + wheel_radius, wheel_y + wheel_radius], 
                 outline=(0, 0, 0), width=2)
    
    # Frame
    draw.line([(front_wheel_x, wheel_y), (size // 2, 12)], fill=color, width=2)
    draw.line([(size // 2, 12), (rear_wheel_x, wheel_y)], fill=color, width=2)
    draw.line([(size // 2, 12), (front_wheel_x, wheel_y)], fill=color, width=2)
    
    # Seat
    draw.ellipse([size // 2 - 6, 10, size // 2 + 6, 16], fill=color, outline=(0, 0, 0), width=1)
    
    # Handlebars
    draw.line([(front_wheel_x - 3, wheel_y - 15), (front_wheel_x + 3, wheel_y - 15)], fill=(0, 0, 0), width=2)
    
    # Front point
    points = [(size // 2, 5), (size // 2 - 3, 12), (size // 2 + 3, 12)]
    draw.polygon(points, fill=color, outline=(0, 0, 0))
    
    return img

def create_pedestrian_icon(size=64, color=(255, 100, 0)):
    """Create a pedestrian icon."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Head
    head_radius = 5
    head_x = size // 2
    head_y = 12
    draw.ellipse([head_x - head_radius, head_y - head_radius, 
                  head_x + head_radius, head_y + head_radius], 
                 fill=color, outline=(0, 0, 0), width=1)
    
    # Body
    draw.rectangle([head_x - 4, head_y + 5, head_x + 4, head_y + 18], fill=color, outline=(0, 0, 0), width=1)
    
    # Arms
    draw.line([(head_x - 6, head_y + 8), (head_x + 6, head_y + 8)], fill=color, width=3)
    
    # Legs
    draw.line([(head_x - 2, head_y + 18), (head_x - 4, head_y + 30)], fill=color, width=3)
    draw.line([(head_x + 2, head_y + 18), (head_x + 4, head_y + 30)], fill=color, width=3)
    
    # Front point (arrow)
    points = [(size // 2, 5), (size // 2 - 4, 12), (size // 2 + 4, 12)]
    draw.polygon(points, fill=color, outline=(0, 0, 0))
    
    return img

def create_triangle_icon(size=64, color=(255, 165, 0)):
    """Create warning triangle icon."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Draw yellow/orange warning triangle pointing upward
    # Triangle vertices: top center, bottom left, bottom right
    points = [
        (size//2, size//4),           # Top
        (size//4, 3*size//4),         # Bottom left
        (3*size//4, 3*size//4)        # Bottom right
    ]
    draw.polygon(points, fill=color, outline=(0, 0, 0), width=2)

    # Draw exclamation mark inside triangle
    draw.ellipse(
        [(size//2 - 2, size//2 - 8),
         (size//2 + 2, size//2 - 4)],
        fill=(0, 0, 0)
    )
    draw.rectangle(
        [(size//2 - 2, size//2),
         (size//2 + 2, size//2 + 8)],
        fill=(0, 0, 0)
    )

    return img

def create_icons(output_dir='vehicle_icons', size=64):
    """Create all vehicle icons."""
    os.makedirs(output_dir, exist_ok=True)

    icons = {
        'car.png': create_car_icon(size),
        'electric.png': create_electric_icon(size),
        'motorcycle.png': create_motorcycle_icon(size),
        'truck.png': create_truck_icon(size),
        'van.png': create_van_icon(size),
        'bicycle.png': create_bicycle_icon(size),
        'pedestrian.png': create_pedestrian_icon(size),
        'triangle.png': create_triangle_icon(size),
    }

    for filename, img in icons.items():
        filepath = os.path.join(output_dir, filename)
        img.save(filepath, 'PNG')
        print(f"Created: {filepath}")

if __name__ == '__main__':
    create_icons()
    print("All vehicle icons created successfully!")

