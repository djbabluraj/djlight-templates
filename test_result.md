#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Dj Light Templates Android app. Most recent in-session ask: fix the "black screen"
  shown for video templates on the Home grid when no thumbnail was uploaded.
  User explicitly requested option (b): auto-extract the first frame of the video URL
  as the poster. After implementing, run focused verification on:
    1. Video thumbnail / black-screen fix on Home
    2. Home screen video preview behaviour (no autoplay, static poster + play overlay)
    3. Download functionality on Android (SAF flow via expo-file-system)
    4. Template detail page video playback (tap-to-play VideoView)

frontend:
  - task: "Home grid video poster — auto-extract first frame when no thumbnail uploaded"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/index.tsx, /app/frontend/src/utils/videoPoster.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            Added expo-video-thumbnails (v10.0.8) and a new helper at
            src/utils/videoPoster.ts that extracts the first frame of a remote
            video URL and caches the result via the existing AsyncStorage wrapper.
            TemplateCard in app/(tabs)/index.tsx now uses this poster as the
            fallback when no `thumbnail_base64` is set. While extraction is
            in-flight (or on web where there's no decoder) the card shows a
            branded purple gradient + circular Play icon + "TAP TO PREVIEW"
            label instead of the previous dark/black gradient that looked
            broken. Web preview can't decode H.264 so it will always render
            the branded fallback there; on Android the extracted JPEG should
            appear.

  - task: "Template detail hero — show extracted poster + improved video-only fallback"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/template/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            Detail hero now: (1) uses uploaded thumbnail if present, else (2)
            renders the extracted first-frame poster from getVideoPoster(), else
            (3) renders the branded purple gradient fallback. The tap-to-play
            button still mounts the actual VideoView only after user interaction,
            preserving the YouTube-style behaviour the user requested in a
            previous turn. No autoplay, native controls on the player.

  - task: "Home grid — no auto-playing video decoders"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            Already in place from previous turn — re-verify after refactor.
            Cards render static thumbnails only; tapping navigates to the
            detail screen.

  - task: "Android SAF download flow"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/utils/downloader.ts, /app/frontend/app/template/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            No code changes this turn. Re-verify that the download CTA flows
            through the existing SAF helper (folder picker on first run, silent
            save afterwards). On web, expect the share / fallback path.

backend:
  - task: "Templates list / detail endpoints"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: |
            No backend changes this turn — endpoints are stable and were last
            verified in the previous session.

metadata:
  created_by: "main_agent"
  version: "1.2"
  test_sequence: 3
  run_ui: true

test_plan:
  current_focus:
    - "Home grid video poster — auto-extract first frame when no thumbnail uploaded"
    - "Template detail hero — show extracted poster + improved video-only fallback"
    - "Home grid — no auto-playing video decoders"
    - "Android SAF download flow"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "main"
      message: |
        Iteration 6 — AdMob integration (test mode).

        Backend: no changes. Frontend additions:
          • Installed react-native-google-mobile-ads (Expo config plugin).
          • app.json: added the plugin block + Google's official sample
            App IDs (Android & iOS test IDs).
          • New module /app/frontend/src/ads/:
              - ads.ts / ads.web.ts          (initAds, AD_UNIT_IDS)
              - AdBanner.tsx / .web.tsx      (BannerAd wrapper, null on web)
              - interstitial.ts / .web.ts    (preload + show, no-op on web)
              - downloadAdGate.ts            (counter -> interstitial every 3)
          • app/_layout.tsx now calls initAds() + primeInterstitial() once.
          • app/(tabs)/index.tsx: ListFooterComponent renders <AdBanner/>.
          • app/template/[id].tsx:
              - Renders <AdBanner/> at the end of the ScrollView.
              - After a successful download, calls
                recordSuccessfulDownload() which increments persistent
                counter and shows interstitial on every 3rd success.

        Test ad unit IDs used (Google's public sample IDs):
          banner       ca-app-pub-3940256099942544/6300978111
          interstitial ca-app-pub-3940256099942544/1033173712

        Web preview: AdBanner is `null` and downloadAdGate's interstitial
        is a no-op — verified the web bundle compiles and the screens
        render without crashes (smoke screenshots captured).

        Real ad rendering can ONLY be verified on a native dev/production
        build. We are deferring on-device verification until the user
        triggers the Emergent Publish/build flow.

        Please test:
          A. Backend regressions:
              1. GET /api/templates still returns 200.
              2. Auto-generated thumbnails still propagate.
              3. Admin login / CRUD endpoints still 200/2xx.
          B. Frontend (web preview):
              1. Library tab loads, lists templates, no console errors
                 from the AdMob module.
              2. Banner footer slot is present (returns null on web —
                 just verify no layout crash and the FlatList footer
                 testID `home-ad-banner` exists).
              3. Tap a template → detail screen loads; no crash;
                 testID `detail-ad-banner` is present near the end of
                 the ScrollView (above the sticky CTA).
              4. Trigger 3 successful downloads (mock or real) and
                 confirm the gate is invoked — on web `showInterstitial`
                 always returns false, just verify no exception is
                 thrown and the persistent counter increments via the
                 storage helper.
              5. Settings tab still loads.
              6. Existing thumbnails / video previews / download flow
                 remain unchanged.

        Files of reference:
          - /app/frontend/app.json
          - /app/frontend/app/_layout.tsx
          - /app/frontend/app/(tabs)/index.tsx
          - /app/frontend/app/template/[id].tsx
          - /app/frontend/src/ads/* (7 files)
          - /app/backend/server.py (unchanged this turn)

        Credentials (unchanged): admin@djlights.com / DjLights2026!
        the home/detail screens ONLY show real video content (or admin
        thumbnail). I moved the thumbnail generation to the backend using
        ffmpeg so every video template gets a real first-frame poster
        stored as `thumbnail_base64`.

        Backend changes (/app/backend/server.py):
          • New helpers `_resolve_video_url` (handles Google Drive share URLs),
            `_is_usable_b64_thumb` (rejects too-short / corrupt payloads),
            `_ffmpeg_extract_jpeg_b64` (subprocess wrapper), and
            `generate_video_thumbnail_b64` (async, tries 4 timestamps).
          • POST /admin/templates → if media_type=video and no usable
            thumbnail, auto-generate from video_url before insert.
          • PATCH /admin/templates/{id} → same auto-generation when the
            update leaves a video record without a usable thumbnail.
          • NEW endpoint POST /admin/templates/{id}/regenerate-thumbnail
            for manual re-extraction.
          • Startup task `_backfill_video_thumbnails` fires on every
            launch (background) to fix any pre-existing video records
            that lack a real thumbnail.
          • Installed ffmpeg in the container (apt).

        Frontend changes:
          • Removed splash-image fallback (`DEFAULT_THUMB` / `DEFAULT_HERO`)
            and the purple placeholder card.
          • TemplateCard fallback chain now is: admin thumbnail → on-the-fly
            extracted poster (Android) → plain dark surface (#111114, just
            the Play overlay). The app logo is NEVER used.
          • Same on the template detail hero.
          • Kept the play badge centered above every video card.

        DB result after backfill:
          • Demo "Neon Pulse · Sample (URL preview)" now has a 43KB JPEG
            extracted from the first frame of its video_url.
          • TEST_SwapImg2Vid (legacy test record with corrupt 114-char
            thumb + no video_url) correctly renders the dark surface +
            play overlay (no logo).

        Please re-test:
          1. GET /api/templates returns correct records, including
             real thumbnails for video templates that have a usable
             video_url.
          2. POST /admin/templates with media_type=video and an empty
             thumbnail_base64 BUT a working video_url → returned record
             must include a populated thumbnail_base64 (>= 400 chars
             base64).
          3. POST /admin/templates/{id}/regenerate-thumbnail returns
             200 with a new thumbnail when video_url is reachable.
          4. Home grid renders no app-logo / no purple placeholder for
             video templates.
          5. Template detail hero behaves the same way (no logo).
          6. Download flow and tap-to-play VideoView still work.

        Admin creds (unchanged): admin@djlights.com / DjLights2026!
        Sample reachable URL for tests:
          https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4

    - agent: "main"
      message: |
        (iteration_4 summary kept for context — frontend regression
         confirmed the previous splash-image fallback. That entire
         approach has now been replaced by the server-side ffmpeg
         pipeline above.)
