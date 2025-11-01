#!/usr/bin/env python3
"""
Generate QR code for Voyagr APK download URL.

This script generates a QR code that links to the Voyagr APK download.
Users can scan this QR code with their Android device camera to quickly
download and install the app.

Usage:
    python generate_qr.py
    
Output:
    apk_download_qr.png - QR code image file
"""

import sys

try:
    import qrcode
except ImportError:
    print("Error: qrcode module not installed")
    print("Install with: pip install qrcode[pil]")
    sys.exit(1)


def generate_qr_code(url, filename='apk_download_qr.png'):
    """
    Generate QR code for given URL.
    
    Args:
        url (str): URL to encode in QR code
        filename (str): Output filename for QR code image
    
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        # Create QR code instance
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        
        # Add data and generate
        qr.add_data(url)
        qr.make(fit=True)
        
        # Create image
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Save image
        img.save(filename)
        
        print(f"✅ QR code generated successfully: {filename}")
        print(f"📱 URL encoded: {url}")
        print(f"📏 Size: {img.size[0]}x{img.size[1]} pixels")
        
        return True
    
    except Exception as e:
        print(f"❌ Error generating QR code: {e}")
        return False


def main():
    """Main function."""
    print("=" * 60)
    print("Voyagr APK QR Code Generator")
    print("=" * 60)
    
    # APK download URL (update with actual GitHub release URL)
    # Example: https://github.com/voyagr/voyagr/releases/download/v1.0.0/voyagr-1.0.0-debug.apk
    url = "https://github.com/voyagr/voyagr/releases/download/v1.0.0/voyagr-1.0.0-debug.apk"
    
    print(f"\n📝 Generating QR code for:")
    print(f"   {url}")
    print()
    
    # Generate QR code
    success = generate_qr_code(url, 'apk_download_qr.png')
    
    if success:
        print("\n✨ QR code ready for use!")
        print("📸 Users can scan with Android camera to download APK")
        print("\n💡 Tips:")
        print("   - Print the QR code for physical distribution")
        print("   - Share the image file digitally")
        print("   - Include in documentation or README")
    else:
        print("\n❌ Failed to generate QR code")
        sys.exit(1)


if __name__ == '__main__':
    main()

