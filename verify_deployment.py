#!/usr/bin/env python3
"""
Voyagr Deployment Verification Script
Verifies all prerequisites and configurations for Android deployment.
"""

import os
import sys
import subprocess
import json
from pathlib import Path


class DeploymentVerifier:
    def __init__(self):
        self.results = {
            'passed': [],
            'failed': [],
            'warnings': []
        }
        self.project_root = Path.cwd()

    def check_python_version(self):
        """Check Python version."""
        version = sys.version_info
        if version.major >= 3 and version.minor >= 8:
            self.results['passed'].append(f"✅ Python {version.major}.{version.minor}.{version.micro}")
            return True
        else:
            self.results['failed'].append(f"❌ Python version {version.major}.{version.minor} (need 3.8+)")
            return False

    def check_file_exists(self, filename):
        """Check if file exists."""
        if (self.project_root / filename).exists():
            self.results['passed'].append(f"✅ {filename} exists")
            return True
        else:
            self.results['failed'].append(f"❌ {filename} missing")
            return False

    def check_command_exists(self, command):
        """Check if command is available."""
        try:
            subprocess.run([command, '--version'], capture_output=True, timeout=5)
            self.results['passed'].append(f"✅ {command} installed")
            return True
        except (FileNotFoundError, subprocess.TimeoutExpired):
            self.results['failed'].append(f"❌ {command} not found")
            return False

    def check_python_package(self, package):
        """Check if Python package is installed."""
        try:
            __import__(package)
            self.results['passed'].append(f"✅ {package} installed")
            return True
        except ImportError:
            self.results['failed'].append(f"❌ {package} not installed")
            return False

    def check_buildozer_spec(self):
        """Verify buildozer.spec configuration."""
        spec_file = self.project_root / 'buildozer.spec'
        if not spec_file.exists():
            self.results['failed'].append("❌ buildozer.spec missing")
            return False

        with open(spec_file, 'r') as f:
            content = f.read()

        checks = [
            ('title = Voyagr', 'App title'),
            ('package.name = voyagr', 'Package name'),
            ('android.permissions', 'Android permissions'),
            ('android.api = 31', 'Android API level'),
            ('android.minapi = 21', 'Minimum API level'),
            ('android.ndk = 25b', 'NDK version'),
        ]

        all_ok = True
        for check, desc in checks:
            if check in content:
                self.results['passed'].append(f"✅ buildozer.spec: {desc}")
            else:
                self.results['failed'].append(f"❌ buildozer.spec: {desc} missing")
                all_ok = False

        return all_ok

    def check_requirements(self):
        """Verify requirements.txt."""
        req_file = self.project_root / 'requirements.txt'
        if not req_file.exists():
            self.results['failed'].append("❌ requirements.txt missing")
            return False

        with open(req_file, 'r') as f:
            content = f.read()

        required = ['kivy', 'plyer', 'requests', 'geopy']
        all_ok = True
        for pkg in required:
            if pkg in content:
                self.results['passed'].append(f"✅ requirements.txt: {pkg}")
            else:
                self.results['failed'].append(f"❌ requirements.txt: {pkg} missing")
                all_ok = False

        return all_ok

    def check_tests(self):
        """Run unit tests."""
        try:
            result = subprocess.run(
                ['python', '-m', 'pytest', 'test_core_logic.py', '-v', '--tb=short'],
                capture_output=True,
                timeout=60,
                cwd=self.project_root
            )
            if result.returncode == 0:
                self.results['passed'].append("✅ All 43 unit tests passing")
                return True
            else:
                self.results['failed'].append("❌ Unit tests failing")
                return False
        except Exception as e:
            self.results['warnings'].append(f"⚠️  Could not run tests: {e}")
            return False

    def check_syntax(self):
        """Check Python syntax."""
        files = ['satnav.py', 'hazard_parser.py']
        all_ok = True
        for filename in files:
            try:
                with open(self.project_root / filename, 'r') as f:
                    compile(f.read(), filename, 'exec')
                self.results['passed'].append(f"✅ {filename} syntax OK")
            except SyntaxError as e:
                self.results['failed'].append(f"❌ {filename} syntax error: {e}")
                all_ok = False

        return all_ok

    def check_disk_space(self):
        """Check available disk space."""
        try:
            import shutil
            total, used, free = shutil.disk_usage(self.project_root)
            free_gb = free / (1024**3)
            if free_gb >= 20:
                self.results['passed'].append(f"✅ Disk space: {free_gb:.1f}GB available")
                return True
            else:
                self.results['warnings'].append(f"⚠️  Low disk space: {free_gb:.1f}GB (need 20GB+)")
                return False
        except Exception as e:
            self.results['warnings'].append(f"⚠️  Could not check disk space: {e}")
            return False

    def check_environment_variables(self):
        """Check Android environment variables."""
        vars_to_check = [
            'ANDROID_SDK_ROOT',
            'ANDROID_NDK_ROOT',
            'JAVA_HOME'
        ]

        for var in vars_to_check:
            if os.environ.get(var):
                self.results['passed'].append(f"✅ {var} set")
            else:
                self.results['warnings'].append(f"⚠️  {var} not set (may be needed for build)")

    def run_all_checks(self):
        """Run all verification checks."""
        print("\n" + "="*60)
        print("🚀 VOYAGR ANDROID DEPLOYMENT VERIFICATION")
        print("="*60 + "\n")

        print("📋 Checking Python Environment...")
        self.check_python_version()
        self.check_python_package('kivy')
        self.check_python_package('plyer')
        self.check_python_package('requests')
        self.check_python_package('geopy')

        print("\n📁 Checking Project Files...")
        self.check_file_exists('satnav.py')
        self.check_file_exists('hazard_parser.py')
        self.check_file_exists('buildozer.spec')
        self.check_file_exists('requirements.txt')
        self.check_file_exists('README.md')

        print("\n⚙️  Checking Configuration...")
        self.check_buildozer_spec()
        self.check_requirements()

        print("\n🧪 Checking Code Quality...")
        self.check_syntax()
        self.check_tests()

        print("\n💾 Checking System Resources...")
        self.check_disk_space()

        print("\n🔧 Checking Build Tools...")
        self.check_command_exists('buildozer')
        self.check_command_exists('java')
        self.check_command_exists('adb')

        print("\n🌍 Checking Environment Variables...")
        self.check_environment_variables()

    def print_results(self):
        """Print verification results."""
        print("\n" + "="*60)
        print("📊 VERIFICATION RESULTS")
        print("="*60 + "\n")

        if self.results['passed']:
            print("✅ PASSED:")
            for item in self.results['passed']:
                print(f"  {item}")

        if self.results['warnings']:
            print("\n⚠️  WARNINGS:")
            for item in self.results['warnings']:
                print(f"  {item}")

        if self.results['failed']:
            print("\n❌ FAILED:")
            for item in self.results['failed']:
                print(f"  {item}")

        print("\n" + "="*60)
        passed = len(self.results['passed'])
        failed = len(self.results['failed'])
        warnings = len(self.results['warnings'])

        print(f"Summary: {passed} passed, {warnings} warnings, {failed} failed")

        if failed == 0:
            print("\n✅ DEPLOYMENT READY!")
            print("\nNext steps:")
            print("1. Set Android environment variables (if needed)")
            print("2. Run: buildozer android debug")
            print("3. Deploy: buildozer android debug deploy run")
            return True
        else:
            print("\n❌ DEPLOYMENT NOT READY")
            print("\nPlease fix the failed items above before deploying.")
            return False

        print("="*60 + "\n")


def main():
    """Main entry point."""
    verifier = DeploymentVerifier()
    verifier.run_all_checks()
    success = verifier.print_results()
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()

