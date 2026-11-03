'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const ffmpegPath = require('ffmpeg-static');

const execFileAsync = promisify(execFile);

async function transcodeAudioToMp3(inputPath) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'botora-audio-playback-'));
  const outputPath = path.join(tempDir, 'playback.mp3');
  try {
    await execFileAsync(ffmpegPath, [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', inputPath,
      '-map', '0:a:0',
      '-vn',
      '-codec:a', 'libmp3lame',
      '-b:a', '96k',
      '-f', 'mp3',
      outputPath
    ], { windowsHide: true });
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true });
    throw new Error(`Conversion du vocal en MP3 impossible: ${error.message}`, { cause: error });
  }

  return {
    path: outputPath,
    cleanup: () => fs.rm(tempDir, { recursive: true, force: true })
  };
}

module.exports = { transcodeAudioToMp3 };
