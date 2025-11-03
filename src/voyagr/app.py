"""
Voyagr - Minimal test app for Android
"""

import toga
from toga.style import Pack

class VoyagrApp(toga.App):
    def startup(self):
        """Minimal startup - just show a label"""
        # Create a simple box with just a label
        main_box = toga.Box(style=Pack(direction='column'))

        # Add a simple label
        label = toga.Label(
            'Voyagr App Running!',
            style=Pack(padding=20)
        )
        main_box.add(label)

        # Create main window
        self.main_window = toga.MainWindow(self.formal_name)
        self.main_window.content = main_box
        self.main_window.show()


def main():
    return VoyagrApp(
        'Voyagr',
        'org.voyagr.voyagr'
    )

