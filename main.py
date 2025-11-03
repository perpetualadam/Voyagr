#!/usr/bin/env python3
"""
Voyagr - Main Entry Point for Android Build
This file serves as the entry point for the Buildozer Android build.
It imports and runs the simplified Voyagr application for Android.
"""

import os
import sys

# Add the current directory to the path so we can import modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import and run the Android-optimized app
if __name__ == '__main__':
    from satnav_android import VoyagrApp
    app = VoyagrApp()
    app.run()

