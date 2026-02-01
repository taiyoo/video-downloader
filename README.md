# Video Downloader Web Application

A comprehensive web interface for downloading videos and audio from 1000+ websites using yt-dlp.

![Screenshot](screenshot.png)

## Features

- 🎬 **Download Videos** - Support for YouTube, Vimeo, Twitter, TikTok, and 1000+ sites
- 🎵 **Extract Audio** - Convert to MP3, M4A, WAV, FLAC, or OPUS formats
- 📊 **Quality Selection** - Choose from 4K, 1080p, 720p, and more
- 📈 **Real-time Progress** - Track download progress with speed and ETA
- 📁 **File Library** - Manage downloaded files directly in the browser
- 🌙 **Modern UI** - Clean, responsive dark theme design

## Prerequisites

- Python 3.8 or higher
- FFmpeg (required for audio conversion and merging video/audio streams)

### Installing FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install ffmpeg
```

**Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH.

## Installation

1. **Clone or navigate to the project directory:**
   ```bash
   cd video-downloader
   ```

2. **Create a virtual environment (recommended):**
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

## Usage

1. **Start the server:**
   ```bash
   python app.py
   ```

2. **Open your browser:**
   Navigate to `http://localhost:5000`

3. **Download a video:**
   - Paste a video URL
   - Click "Fetch" to get video info
   - Choose video/audio format and quality
   - Click "Download"

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Main web interface |
| `/api/info` | POST | Get video information |
| `/api/download` | POST | Start a download |
| `/api/progress/<id>` | GET | Get download progress |
| `/api/downloads` | GET | List downloaded files |
| `/api/download/file/<filename>` | GET | Download a file |
| `/api/delete/<filename>` | DELETE | Delete a file |
| `/api/supported-sites` | GET | List supported sites |

## Project Structure

```
video-downloader/
├── app.py                 # Flask backend application
├── requirements.txt       # Python dependencies
├── README.md             # This file
├── downloads/            # Downloaded files directory
├── templates/
│   └── index.html        # Main HTML template
└── static/
    ├── css/
    │   └── style.css     # Stylesheet
    └── js/
        └── app.js        # Frontend JavaScript
```

## Configuration

Edit `app.py` to customize:

- `DOWNLOAD_FOLDER`: Where files are saved (default: `./downloads`)
- Server host/port in `app.run()` (default: `0.0.0.0:5000`)

## Production Deployment

For production use, run with Gunicorn:

```bash
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

## Supported Sites

yt-dlp supports over 1000 sites including:
- YouTube
- Vimeo
- Twitter/X
- TikTok
- Instagram
- Facebook
- Dailymotion
- Twitch
- SoundCloud
- And many more...

Run `yt-dlp --list-extractors` to see all supported sites.

## Troubleshooting

### "FFmpeg not found" error
Make sure FFmpeg is installed and in your system PATH.

### Download fails
- Check the video URL is correct and accessible
- Some videos may be region-restricted or private
- Update yt-dlp: `pip install -U yt-dlp`

### Slow downloads
- Video quality affects download speed
- The server's connection speed matters

## Disclaimer

⚠️ Please respect copyright laws and only download content you have the right to access. This tool is intended for personal use only.

## License

MIT License - Feel free to use and modify.
