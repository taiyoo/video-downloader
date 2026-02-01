"""
Video Downloader Web Application
A comprehensive web interface for downloading videos and audio using yt-dlp
"""

import os
import re
import json
import uuid
import threading
import sqlite3
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_file, Response
from flask_cors import CORS
import yt_dlp

app = Flask(__name__)
CORS(app)

# Configuration
DOWNLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'downloads')
SUBTITLES_FOLDER = os.path.join(DOWNLOAD_FOLDER, 'subtitles')
DATABASE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'download_history.db')
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)
os.makedirs(SUBTITLES_FOLDER, exist_ok=True)

# Store download progress and status
downloads = {}
download_lock = threading.Lock()

# Download queue for batch downloads
download_queue = []
queue_lock = threading.Lock()
queue_processing = False


def init_database():
    """Initialize SQLite database for download history"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS download_history (
            id TEXT PRIMARY KEY,
            url TEXT NOT NULL,
            title TEXT,
            thumbnail TEXT,
            uploader TEXT,
            duration INTEGER,
            quality TEXT,
            format_type TEXT,
            audio_format TEXT,
            filename TEXT,
            filesize INTEGER,
            status TEXT,
            error TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()


def save_to_history(download_id, url, title, thumbnail, uploader, duration, 
                   quality, format_type, audio_format, filename, filesize, status, error=None):
    """Save download to history database"""
    try:
        conn = sqlite3.connect(DATABASE_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT OR REPLACE INTO download_history 
            (id, url, title, thumbnail, uploader, duration, quality, format_type, 
             audio_format, filename, filesize, status, error, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (download_id, url, title, thumbnail, uploader, duration, quality, 
              format_type, audio_format, filename, filesize, status, error,
              datetime.now().isoformat() if status == 'completed' else None))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error saving to history: {e}")


def get_history(limit=50, offset=0, search=''):
    """Get download history from database"""
    try:
        conn = sqlite3.connect(DATABASE_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        if search:
            cursor.execute('''
                SELECT * FROM download_history 
                WHERE title LIKE ? OR url LIKE ?
                ORDER BY created_at DESC LIMIT ? OFFSET ?
            ''', (f'%{search}%', f'%{search}%', limit, offset))
        else:
            cursor.execute('''
                SELECT * FROM download_history 
                ORDER BY created_at DESC LIMIT ? OFFSET ?
            ''', (limit, offset))
        
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]
    except Exception as e:
        print(f"Error getting history: {e}")
        return []


# Initialize database on startup
init_database()


def sanitize_filename(filename):
    """Remove invalid characters from filename"""
    return re.sub(r'[<>:"/\\|?*]', '', filename)


class DownloadProgress:
    """Track download progress"""
    def __init__(self, download_id, url='', quality='best', audio_only=False, audio_format='mp3', 
                 download_subs=False, sub_lang='en', embed_subs=False, is_playlist=False):
        self.download_id = download_id
        self.progress = 0
        self.status = 'pending'
        self.filename = ''
        self.title = ''
        self.speed = ''
        self.eta = ''
        self.filesize = ''
        self.error = ''
        self.warning = ''  # For non-fatal issues like subtitle failures
        self.current_stream = 0  # Track which stream we're downloading (0=video, 1=audio)
        self.stream_progress = [0, 0]  # Progress for each stream
        self.total_streams = 1  # Will be set to 2 for video+audio
        self.is_merging = False
        # Store parameters for resume capability
        self.url = url
        self.quality = quality
        self.audio_only = audio_only
        self.audio_format = audio_format
        self.retry_count = 0
        self.max_retries = 3
        # New features
        self.download_subs = download_subs
        self.sub_lang = sub_lang
        self.embed_subs = embed_subs
        self.thumbnail = ''
        self.uploader = ''
        self.duration = 0
        # Playlist support
        self.is_playlist = is_playlist
        self.playlist_index = 0
        self.playlist_count = 0
        self.playlist_title = ''

    def reset_for_retry(self):
        """Reset progress state for a retry attempt"""
        self.progress = 0
        self.status = 'pending'
        self.speed = ''
        self.eta = ''
        self.error = ''
        self.warning = ''
        self.current_stream = 0
        self.stream_progress = [0, 0]
        self.is_merging = False
        self.retry_count += 1

    def to_dict(self):
        return {
            'id': self.download_id,
            'progress': self.progress,
            'status': self.status,
            'filename': self.filename,
            'title': self.title,
            'speed': self.speed,
            'eta': self.eta,
            'filesize': self.filesize,
            'error': self.error,
            'warning': self.warning,
            'is_merging': self.is_merging,
            'can_retry': self.status == 'error' and self.retry_count < self.max_retries,
            'retry_count': self.retry_count,
            'url': self.url,
            'thumbnail': self.thumbnail,
            'is_playlist': self.is_playlist,
            'playlist_index': self.playlist_index,
            'playlist_count': self.playlist_count,
            'playlist_title': self.playlist_title
        }


def progress_hook(d, download_id):
    """Hook to track download progress - handles multi-stream downloads"""
    with download_lock:
        if download_id not in downloads:
            return
        
        download = downloads[download_id]
        
        if d['status'] == 'downloading':
            download.status = 'downloading'
            download.is_merging = False
            
            # Calculate current stream progress
            stream_progress = 0
            if 'downloaded_bytes' in d and 'total_bytes' in d and d['total_bytes']:
                stream_progress = round((d['downloaded_bytes'] / d['total_bytes']) * 100, 1)
            elif 'downloaded_bytes' in d and 'total_bytes_estimate' in d and d['total_bytes_estimate']:
                stream_progress = round((d['downloaded_bytes'] / d['total_bytes_estimate']) * 100, 1)
            elif '_percent_str' in d:
                try:
                    stream_progress = float(d['_percent_str'].replace('%', '').strip())
                except:
                    pass
            
            # Update stream progress and calculate overall progress
            download.stream_progress[download.current_stream] = stream_progress
            
            # Calculate weighted overall progress based on number of streams
            if download.total_streams == 2:
                # Video + Audio: each counts for 45%, merging is 10%
                download.progress = round(
                    (download.stream_progress[0] * 0.45) + 
                    (download.stream_progress[1] * 0.45),
                    1
                )
            else:
                download.progress = stream_progress
            
            # Extract speed
            if '_speed_str' in d:
                download.speed = d['_speed_str']
            elif 'speed' in d and d['speed']:
                speed = d['speed']
                if speed > 1024 * 1024:
                    download.speed = f"{speed / (1024 * 1024):.1f} MiB/s"
                elif speed > 1024:
                    download.speed = f"{speed / 1024:.1f} KiB/s"
                else:
                    download.speed = f"{speed:.0f} B/s"
            
            # Extract ETA
            if '_eta_str' in d:
                download.eta = d['_eta_str']
            elif 'eta' in d and d['eta']:
                download.eta = f"{d['eta']}s"
            
            # Extract filesize
            if '_total_bytes_str' in d:
                download.filesize = d['_total_bytes_str']
            elif 'total_bytes' in d and d['total_bytes']:
                size = d['total_bytes']
                if size > 1024 * 1024 * 1024:
                    download.filesize = f"{size / (1024 * 1024 * 1024):.2f} GiB"
                elif size > 1024 * 1024:
                    download.filesize = f"{size / (1024 * 1024):.2f} MiB"
                else:
                    download.filesize = f"{size / 1024:.2f} KiB"
            
            if 'filename' in d:
                download.filename = os.path.basename(d['filename'])
                
        elif d['status'] == 'finished':
            # Stream finished - check if there are more streams
            download.stream_progress[download.current_stream] = 100
            
            if download.current_stream < download.total_streams - 1:
                # Move to next stream
                download.current_stream += 1
                download.speed = ''
                download.eta = ''
                # Recalculate progress
                if download.total_streams == 2:
                    download.progress = round(
                        (download.stream_progress[0] * 0.45) + 
                        (download.stream_progress[1] * 0.45),
                        1
                    )
            else:
                # All streams finished, now merging
                download.status = 'processing'
                download.is_merging = True
                download.progress = 90  # Merging phase
                download.speed = ''
                download.eta = 'Merging...'
            
            if 'filename' in d:
                download.filename = os.path.basename(d['filename'])
                
        elif d['status'] == 'error':
            download.status = 'error'
            if 'error' in d:
                download.error = str(d['error'])


def get_video_info(url):
    """Get video information without downloading"""
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': 'in_playlist',  # Get playlist info without downloading each video
    }
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        
        # Check if it's a playlist
        is_playlist = info.get('_type') == 'playlist' or 'entries' in info
        
        if is_playlist:
            entries = list(info.get('entries', []))
            return {
                'is_playlist': True,
                'playlist_title': info.get('title', 'Playlist'),
                'playlist_id': info.get('id', ''),
                'playlist_count': len(entries),
                'uploader': info.get('uploader', 'Unknown'),
                'thumbnail': info.get('thumbnail', '') or (entries[0].get('thumbnail', '') if entries else ''),
                'entries': [{
                    'id': e.get('id', ''),
                    'title': e.get('title', 'Unknown'),
                    'url': e.get('url', '') or e.get('webpage_url', ''),
                    'thumbnail': e.get('thumbnail', ''),
                    'duration': e.get('duration', 0),
                    'uploader': e.get('uploader', info.get('uploader', 'Unknown')),
                } for e in entries[:50] if e]  # Limit to first 50 videos
            }
        
        # Single video - get full details
        ydl_opts_full = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts_full) as ydl_full:
            info = ydl_full.extract_info(url, download=False)
        
        # Get available formats
        formats = []
        if 'formats' in info:
            for f in info['formats']:
                format_info = {
                    'format_id': f.get('format_id', ''),
                    'ext': f.get('ext', ''),
                    'resolution': f.get('resolution', 'audio only'),
                    'filesize': f.get('filesize', 0),
                    'vcodec': f.get('vcodec', 'none'),
                    'acodec': f.get('acodec', 'none'),
                    'format_note': f.get('format_note', ''),
                    'fps': f.get('fps', 0),
                    'tbr': f.get('tbr', 0),
                }
                formats.append(format_info)
        
        # Get available subtitles
        subtitles = {}
        if 'subtitles' in info:
            for lang, subs in info['subtitles'].items():
                subtitles[lang] = {
                    'name': get_language_name(lang),
                    'formats': [s.get('ext', 'vtt') for s in subs]
                }
        if 'automatic_captions' in info:
            for lang, subs in info['automatic_captions'].items():
                if lang not in subtitles:
                    subtitles[lang] = {
                        'name': get_language_name(lang) + ' (auto)',
                        'formats': [s.get('ext', 'vtt') for s in subs],
                        'auto': True
                    }
        
        return {
            'is_playlist': False,
            'title': info.get('title', 'Unknown'),
            'thumbnail': info.get('thumbnail', ''),
            'duration': info.get('duration', 0),
            'uploader': info.get('uploader', 'Unknown'),
            'view_count': info.get('view_count', 0),
            'description': info.get('description', '')[:500] if info.get('description') else '',
            'formats': formats,
            'webpage_url': info.get('webpage_url', url),
            'subtitles': subtitles,
            'has_subtitles': len(subtitles) > 0,
        }


def get_language_name(code):
    """Get human-readable language name from code"""
    languages = {
        'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German',
        'it': 'Italian', 'pt': 'Portuguese', 'ru': 'Russian', 'ja': 'Japanese',
        'ko': 'Korean', 'zh': 'Chinese', 'ar': 'Arabic', 'hi': 'Hindi',
        'nl': 'Dutch', 'pl': 'Polish', 'tr': 'Turkish', 'vi': 'Vietnamese',
        'th': 'Thai', 'id': 'Indonesian', 'sv': 'Swedish', 'no': 'Norwegian',
    }
    return languages.get(code, code.upper())


def postprocessor_hook(d, download_id):
    """Hook to track post-processing progress"""
    with download_lock:
        if download_id not in downloads:
            return
        download = downloads[download_id]
        
        if d['status'] == 'started':
            download.status = 'processing'
            download.is_merging = True
            download.progress = 92
            download.eta = 'Processing...'
            download.speed = ''
        elif d['status'] == 'processing':
            download.progress = 95
            download.eta = 'Processing...'
        elif d['status'] == 'finished':
            download.progress = 98
            download.eta = 'Finalizing...'


def download_video(url, download_id, format_type='best', quality='best', audio_only=False, 
                   audio_format='mp3', download_subs=False, sub_lang='en', embed_subs=False):
    """Download video in a separate thread"""
    try:
        with download_lock:
            if download_id not in downloads:
                return
            downloads[download_id].status = 'starting'
        
        # Configure output template
        output_template = os.path.join(DOWNLOAD_FOLDER, '%(title)s.%(ext)s')
        
        # Determine if we'll have multiple streams
        will_merge = False
        
        # Base options with resume support
        ydl_opts = {
            'outtmpl': output_template,
            'progress_hooks': [lambda d: progress_hook(d, download_id)],
            'postprocessor_hooks': [lambda d: postprocessor_hook(d, download_id)],
            'quiet': True,
            'no_warnings': True,
            'ignoreerrors': False,
            'noplaylist': True,
            # Resume/continue partial downloads
            'continuedl': True,
            # Keep partial files for resume
            'noprogress': False,
            # Retry on failure
            'retries': 10,
            'fragment_retries': 10,
            # Keep video file if post-processing fails
            'keepvideo': False,
            # Socket timeout
            'socket_timeout': 30,
            # File access retries
            'file_access_retries': 5,
            # Embed thumbnail in audio files
            'writethumbnail': audio_only,
            # Rate limiting protection - add sleep between requests
            'sleep_interval_requests': 1,
            # Don't fail on subtitle errors
            'ignoreerrors': 'only_download',
        }
        
        # Subtitle options - wrapped in try/catch style with ignore errors
        if download_subs and not audio_only:
            ydl_opts['writesubtitles'] = True
            ydl_opts['writeautomaticsub'] = True
            ydl_opts['subtitleslangs'] = [sub_lang, 'en']  # Requested + English fallback
            ydl_opts['subtitlesformat'] = 'srt/vtt/best'
            # Skip unavailable subtitles instead of failing
            ydl_opts['skip_unavailable_fragments'] = True
            # Add sleep to avoid rate limiting on subtitle requests
            ydl_opts['sleep_interval_subtitles'] = 2
            
            if embed_subs:
                # Embed subtitles into video
                if 'postprocessors' not in ydl_opts:
                    ydl_opts['postprocessors'] = []
                ydl_opts['postprocessors'].append({
                    'key': 'FFmpegEmbedSubtitle',
                    # Don't fail if subtitles unavailable
                    'already_have_subtitle': False,
                })
        
        if audio_only:
            # Audio-only download - single stream
            ydl_opts['format'] = 'bestaudio/best'
            ydl_opts['postprocessors'] = [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': audio_format,
                'preferredquality': '192' if quality == 'best' else quality,
            }]
            # Embed thumbnail for audio
            ydl_opts['postprocessors'].append({
                'key': 'EmbedThumbnail',
            })
            ydl_opts['postprocessors'].append({
                'key': 'FFmpegMetadata',
            })
        else:
            # Video download with quality selection - may need merging
            will_merge = True  # Assume video+audio merge for quality downloads
            
            if quality == 'best':
                ydl_opts['format'] = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best'
            elif quality == '2160':
                ydl_opts['format'] = 'bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=2160]+bestaudio/best[height<=2160][ext=mp4]/best'
            elif quality == '1440':
                ydl_opts['format'] = 'bestvideo[height<=1440][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1440]+bestaudio/best[height<=1440][ext=mp4]/best'
            elif quality == '1080':
                ydl_opts['format'] = 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080][ext=mp4]/best'
            elif quality == '720':
                ydl_opts['format'] = 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720][ext=mp4]/best'
            elif quality == '480':
                ydl_opts['format'] = 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best[height<=480][ext=mp4]/best'
            elif quality == '360':
                ydl_opts['format'] = 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=360]+bestaudio/best[height<=360][ext=mp4]/best'
            else:
                ydl_opts['format'] = 'best[ext=mp4]/best'
                will_merge = False
            
            # Merge to mp4
            ydl_opts['merge_output_format'] = 'mp4'
        
        # Set up for multi-stream if needed
        with download_lock:
            if download_id in downloads:
                if will_merge:
                    downloads[download_id].total_streams = 2
                else:
                    downloads[download_id].total_streams = 1
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Get info first
            info = ydl.extract_info(url, download=False)
            with download_lock:
                if download_id in downloads:
                    dl = downloads[download_id]
                    dl.title = info.get('title', 'Unknown')
                    dl.thumbnail = info.get('thumbnail', '')
                    dl.uploader = info.get('uploader', 'Unknown')
                    dl.duration = info.get('duration', 0)
                    
                    # Check actual format selection - see if it requires merging
                    requested_formats = info.get('requested_formats', [])
                    if len(requested_formats) >= 2:
                        dl.total_streams = 2
                    else:
                        dl.total_streams = 1
            
            # Download
            try:
                ydl.download([url])
            except yt_dlp.utils.DownloadError as e:
                # Check if it's just a subtitle error
                error_str = str(e).lower()
                if 'subtitle' in error_str or '429' in error_str:
                    # Subtitle download failed but video may have succeeded
                    with download_lock:
                        if download_id in downloads:
                            dl = downloads[download_id]
                            dl.warning = 'Subtitles unavailable (rate limited), video downloaded successfully'
                else:
                    raise  # Re-raise if it's a real download error
        
        # Save to history
        with download_lock:
            if download_id in downloads:
                dl = downloads[download_id]
                dl.status = 'completed'
                dl.progress = 100
                dl.is_merging = False
                dl.speed = ''
                dl.eta = ''
                
                # Get filesize
                filesize = 0
                if dl.filename:
                    filepath = os.path.join(DOWNLOAD_FOLDER, dl.filename)
                    if os.path.exists(filepath):
                        filesize = os.path.getsize(filepath)
                
                save_to_history(
                    download_id=download_id,
                    url=url,
                    title=dl.title,
                    thumbnail=dl.thumbnail,
                    uploader=dl.uploader,
                    duration=dl.duration,
                    quality=quality,
                    format_type='audio' if audio_only else 'video',
                    audio_format=audio_format if audio_only else None,
                    filename=dl.filename,
                    filesize=filesize,
                    status='completed'
                )
            
    except Exception as e:
        with download_lock:
            if download_id in downloads:
                dl = downloads[download_id]
                dl.status = 'error'
                dl.error = str(e)
                
                save_to_history(
                    download_id=download_id,
                    url=url,
                    title=dl.title,
                    thumbnail=dl.thumbnail,
                    uploader=dl.uploader,
                    duration=dl.duration,
                    quality=quality,
                    format_type='audio' if audio_only else 'video',
                    audio_format=audio_format if audio_only else None,
                    filename=dl.filename,
                    filesize=0,
                    status='error',
                    error=str(e)
                )


@app.route('/')
def index():
    """Render the main page"""
    return render_template('index.html')


@app.route('/api/info', methods=['POST'])
def get_info():
    """Get video information"""
    try:
        data = request.get_json()
        url = data.get('url', '')
        
        if not url:
            return jsonify({'error': 'URL is required'}), 400
        
        info = get_video_info(url)
        return jsonify(info)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/download', methods=['POST'])
def start_download():
    """Start a download"""
    try:
        data = request.get_json()
        url = data.get('url', '')
        quality = data.get('quality', 'best')
        audio_only = data.get('audio_only', False)
        audio_format = data.get('audio_format', 'mp3')
        download_subs = data.get('download_subs', False)
        sub_lang = data.get('sub_lang', 'en')
        embed_subs = data.get('embed_subs', False)
        
        if not url:
            return jsonify({'error': 'URL is required'}), 400
        
        # Create download ID
        download_id = str(uuid.uuid4())
        
        # Initialize progress tracker with parameters for resume
        with download_lock:
            downloads[download_id] = DownloadProgress(
                download_id, 
                url=url, 
                quality=quality, 
                audio_only=audio_only, 
                audio_format=audio_format,
                download_subs=download_subs,
                sub_lang=sub_lang,
                embed_subs=embed_subs
            )
        
        # Start download in background
        thread = threading.Thread(
            target=download_video,
            args=(url, download_id, 'best', quality, audio_only, audio_format, 
                  download_subs, sub_lang, embed_subs)
        )
        thread.daemon = True
        thread.start()
        
        return jsonify({'download_id': download_id})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/batch-download', methods=['POST'])
def batch_download():
    """Start multiple downloads (batch download)"""
    try:
        data = request.get_json()
        urls = data.get('urls', [])
        quality = data.get('quality', 'best')
        audio_only = data.get('audio_only', False)
        audio_format = data.get('audio_format', 'mp3')
        download_subs = data.get('download_subs', False)
        sub_lang = data.get('sub_lang', 'en')
        embed_subs = data.get('embed_subs', False)
        
        if not urls or not isinstance(urls, list):
            return jsonify({'error': 'URLs array is required'}), 400
        
        if len(urls) > 20:
            return jsonify({'error': 'Maximum 20 URLs allowed per batch'}), 400
        
        download_ids = []
        
        for url in urls:
            url = url.strip()
            if not url:
                continue
                
            # Create download ID
            download_id = str(uuid.uuid4())
            download_ids.append(download_id)
            
            # Initialize progress tracker
            with download_lock:
                downloads[download_id] = DownloadProgress(
                    download_id, 
                    url=url, 
                    quality=quality, 
                    audio_only=audio_only, 
                    audio_format=audio_format,
                    download_subs=download_subs,
                    sub_lang=sub_lang,
                    embed_subs=embed_subs
                )
            
            # Start download in background
            thread = threading.Thread(
                target=download_video,
                args=(url, download_id, 'best', quality, audio_only, audio_format,
                      download_subs, sub_lang, embed_subs)
            )
            thread.daemon = True
            thread.start()
        
        return jsonify({'download_ids': download_ids, 'count': len(download_ids)})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/playlist-download', methods=['POST'])
def playlist_download():
    """Download a playlist"""
    try:
        data = request.get_json()
        url = data.get('url', '')
        quality = data.get('quality', 'best')
        audio_only = data.get('audio_only', False)
        audio_format = data.get('audio_format', 'mp3')
        selected_indices = data.get('selected_indices', None)  # None = all
        download_subs = data.get('download_subs', False)
        sub_lang = data.get('sub_lang', 'en')
        embed_subs = data.get('embed_subs', False)
        
        if not url:
            return jsonify({'error': 'URL is required'}), 400
        
        # Get playlist info
        info = get_video_info(url)
        
        if not info.get('is_playlist'):
            return jsonify({'error': 'URL is not a playlist'}), 400
        
        entries = info.get('entries', [])
        
        # Filter by selected indices if provided
        if selected_indices:
            entries = [entries[i] for i in selected_indices if i < len(entries)]
        
        if len(entries) > 50:
            entries = entries[:50]  # Limit to 50 videos
        
        download_ids = []
        playlist_title = info.get('playlist_title', 'Playlist')
        
        for idx, entry in enumerate(entries):
            video_url = entry.get('url') or entry.get('webpage_url')
            if not video_url:
                continue
            
            # Create download ID
            download_id = str(uuid.uuid4())
            download_ids.append(download_id)
            
            # Initialize progress tracker
            with download_lock:
                dl = DownloadProgress(
                    download_id, 
                    url=video_url, 
                    quality=quality, 
                    audio_only=audio_only, 
                    audio_format=audio_format,
                    download_subs=download_subs,
                    sub_lang=sub_lang,
                    embed_subs=embed_subs,
                    is_playlist=True
                )
                dl.title = entry.get('title', f'Video {idx + 1}')
                dl.playlist_title = playlist_title
                dl.playlist_index = idx + 1
                dl.playlist_count = len(entries)
                dl.thumbnail = entry.get('thumbnail', '')
                downloads[download_id] = dl
            
            # Start download in background (with slight delay to prevent overwhelming)
            thread = threading.Thread(
                target=download_video,
                args=(video_url, download_id, 'best', quality, audio_only, audio_format,
                      download_subs, sub_lang, embed_subs)
            )
            thread.daemon = True
            thread.start()
        
        return jsonify({
            'download_ids': download_ids, 
            'count': len(download_ids),
            'playlist_title': playlist_title
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/history')
def get_download_history():
    """Get download history"""
    try:
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)
        search = request.args.get('search', '')
        
        history = get_history(limit=limit, offset=offset, search=search)
        return jsonify(history)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/history/<download_id>', methods=['DELETE'])
def delete_history_item(download_id):
    """Delete a history item"""
    try:
        conn = sqlite3.connect(DATABASE_PATH)
        cursor = conn.cursor()
        cursor.execute('DELETE FROM download_history WHERE id = ?', (download_id,))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/history/clear', methods=['DELETE'])
def clear_history():
    """Clear all download history"""
    try:
        conn = sqlite3.connect(DATABASE_PATH)
        cursor = conn.cursor()
        cursor.execute('DELETE FROM download_history')
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/history/redownload/<download_id>', methods=['POST'])
def redownload_from_history(download_id):
    """Re-download a video from history"""
    try:
        conn = sqlite3.connect(DATABASE_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM download_history WHERE id = ?', (download_id,))
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return jsonify({'error': 'History item not found'}), 404
        
        history_item = dict(row)
        
        # Create new download
        new_download_id = str(uuid.uuid4())
        audio_only = history_item.get('format_type') == 'audio'
        
        with download_lock:
            downloads[new_download_id] = DownloadProgress(
                new_download_id, 
                url=history_item['url'], 
                quality=history_item.get('quality', 'best'), 
                audio_only=audio_only, 
                audio_format=history_item.get('audio_format', 'mp3')
            )
        
        # Start download
        thread = threading.Thread(
            target=download_video,
            args=(history_item['url'], new_download_id, 'best', 
                  history_item.get('quality', 'best'), audio_only, 
                  history_item.get('audio_format', 'mp3'), False, 'en', False)
        )
        thread.daemon = True
        thread.start()
        
        return jsonify({'download_id': new_download_id})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/retry/<download_id>', methods=['POST'])
def retry_download(download_id):
    """Retry a failed download"""
    try:
        with download_lock:
            if download_id not in downloads:
                return jsonify({'error': 'Download not found'}), 404
            
            download = downloads[download_id]
            
            if download.status != 'error':
                return jsonify({'error': 'Download is not in error state'}), 400
            
            if download.retry_count >= download.max_retries:
                return jsonify({'error': 'Maximum retry attempts reached'}), 400
            
            # Reset the download state for retry
            download.reset_for_retry()
            
            url = download.url
            quality = download.quality
            audio_only = download.audio_only
            audio_format = download.audio_format
        
        # Start download in background
        thread = threading.Thread(
            target=download_video,
            args=(url, download_id, 'best', quality, audio_only, audio_format)
        )
        thread.daemon = True
        thread.start()
        
        return jsonify({'download_id': download_id, 'retry_count': download.retry_count})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/progress/<download_id>')
def get_progress(download_id):
    """Get download progress"""
    with download_lock:
        if download_id in downloads:
            return jsonify(downloads[download_id].to_dict())
        return jsonify({'error': 'Download not found'}), 404


@app.route('/api/progress/stream/<download_id>')
def stream_progress(download_id):
    """Stream download progress using Server-Sent Events"""
    def generate():
        while True:
            with download_lock:
                if download_id in downloads:
                    data = downloads[download_id].to_dict()
                    yield f"data: {json.dumps(data)}\n\n"
                    if data['status'] in ['completed', 'error']:
                        break
                else:
                    yield f"data: {json.dumps({'error': 'Download not found'})}\n\n"
                    break
            import time
            time.sleep(0.5)
    
    return Response(generate(), mimetype='text/event-stream')


@app.route('/api/downloads')
def list_downloads():
    """List all downloaded files"""
    try:
        files = []
        for filename in os.listdir(DOWNLOAD_FOLDER):
            filepath = os.path.join(DOWNLOAD_FOLDER, filename)
            if os.path.isfile(filepath):
                stat = os.stat(filepath)
                files.append({
                    'filename': filename,
                    'size': stat.st_size,
                    'created': datetime.fromtimestamp(stat.st_ctime).isoformat(),
                    'modified': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                })
        
        # Sort by modified date, newest first
        files.sort(key=lambda x: x['modified'], reverse=True)
        return jsonify(files)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/download/file/<filename>')
def download_file(filename):
    """Download a file"""
    try:
        filepath = os.path.join(DOWNLOAD_FOLDER, filename)
        if os.path.isfile(filepath):
            return send_file(filepath, as_attachment=True)
        return jsonify({'error': 'File not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/delete/<filename>', methods=['DELETE'])
def delete_file(filename):
    """Delete a downloaded file"""
    try:
        filepath = os.path.join(DOWNLOAD_FOLDER, filename)
        if os.path.isfile(filepath):
            os.remove(filepath)
            return jsonify({'success': True})
        return jsonify({'error': 'File not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/supported-sites')
def supported_sites():
    """Get list of supported sites"""
    extractors = yt_dlp.list_extractors()
    sites = [e.IE_NAME for e in extractors if e.IE_NAME and not e.IE_NAME.startswith('generic')]
    return jsonify(sorted(set(sites))[:100])  # Return top 100


if __name__ == '__main__':
    print(f"📁 Downloads will be saved to: {DOWNLOAD_FOLDER}")
    print(f"🌐 Starting server at http://localhost:5001")
    app.run(debug=True, host='0.0.0.0', port=5001, threaded=True)
