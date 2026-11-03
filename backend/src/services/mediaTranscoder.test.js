'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ffmpegPath = require('ffmpeg-static');
const { transcodeAudioToMp3 } = require('./mediaTranscoder');

test('transcodes an Ogg/Opus voice recording into a playable MP3 and cleans its temporary file', async (t) => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'botora-audio-fixture-'));
  const sourcePath = path.join(fixtureDir, 'voice.ogg');
  t.after(() => fs.rmSync(fixtureDir, { recursive: true, force: true }));

  execFileSync(ffmpegPath, [
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 'lavfi',
    '-i', 'anullsrc=channel_layout=mono:sample_rate=48000',
    '-t', '0.3',
    '-codec:a', 'libopus',
    '-f', 'ogg',
    sourcePath
  ], { windowsHide: true });

  const converted = await transcodeAudioToMp3(sourcePath);
  const bytes = fs.readFileSync(converted.path);
  assert.ok(bytes.length > 0);
  assert.equal(bytes.subarray(0, 3).toString(), 'ID3');

  execFileSync(ffmpegPath, [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', converted.path,
    '-f', 'null',
    '-'
  ], { windowsHide: true, stdio: 'ignore' });

  await converted.cleanup();
  assert.equal(fs.existsSync(converted.path), false);
});
