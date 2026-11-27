# UIT Portal Wrapper

A desktop wrapper for the [UIT Portal website](https://portal.uit.edu.vn/) built with Electron.

## Features

- Custom desktop UI and navigation 
- Quick search (`Ctrl+K`)
- Light, dark, and system themes
- Support for custom CSS theme packs
- Integrated webview navigation for other UIT services (Moodle, ĐRL, UIT Forum)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v22.12.0 or higher recommended)
- npm

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/leYellowPin/uit-portal-wrapper.git
   cd uit-portal-wrapper
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the application:
   ```bash
   npm start
   ```

## Building from Source

```bash
npm run make
```

## Custom Themes

You can load a custom theme folder directly from the app. A valid theme folder uses the following structure:

```text
your_theme/
├── assets/
│   └── asset_files
├── fonts/
│   └── font_files
├── pack.png (optional)
├── theme.css
└── theme.json
```

Reference local images and fonts inside `theme.css` using paths relative to the entry CSS file (for example, `url("./fonts/custom-font.woff2")`).

**Supported file formats:** `.png`, `.svg`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.bmp`, `.avif`, `.ico`, `.woff2`, `.woff`, `.ttf`, `.otf`, `.eot`, `.css`

### Example for `theme.json`

```json
{
  "format_version": 1,
  "id": "theme_id",
  "name": "theme_name",
  "version": "1.0.0",
  "description": "A custom theme.",
  "author": "author_name",
  "compatible_app_version": "<=1.0.0",
  "entry": "theme.css",
  "color_schemes": ["dark", "light"],
  "default_scheme": "dark",
  "icon": "pack.png"
}
```

- `compatible_app_version`: Accepts semver comparison operators (such as `<=1.0.0`, `>=1.0.0`, or `^1.0.0`) to declare forward or backward compatibility with the app.
- `description` and `icon` are optional.

## Disclaimer

This is an unofficial, community-developed project and is not affiliated with or endorsed by UIT.

## License

This project is licensed under the MIT License.
