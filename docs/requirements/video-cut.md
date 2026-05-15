Implementation Prompt: Video Clipper Agent — AI Marketing Multi-Agent System
Your role
You are implementing a new Video Clipper Agent feature inside an existing AI Marketing Multi-Agent system. Every architectural decision — database schema, state shape, queue setup, service patterns — must be derived from what already exists, not from assumptions.

What you are building
A self-contained Video Clipper Agent that:
1. Accepts a long-form video — either a YouTube/public URL or a direct file upload
2. Transcribes the audio to obtain a word-level timestamped transcript
3. Uses an LLM to identify the best short-clip segments (scored by engagement potential, topic coherence, and hook quality in the first 3 seconds)
4. Cuts the source video into short clips using ffmpeg
5. Burns captions onto each clip using a brand font and configurable caption style
6. Stores finished clips in Cloudinary (dev environment) — designed to swap to S3 later
7. Persists clip metadata in the database with status draft
8. Routes into the existing Human Review Gate → Scheduler → Auto Publish nodes
9. Publishes approved clips to TikTok as video posts
This is a parallel pipeline path. Both photo and video paths share the same Orchestrator, Content Pool, Human Review Gate, Scheduler, and Auto Publish nodes. You are adding a branch, not replacing anything.

Part 1 — Database
What the schema must support (derive the tables yourself)
* Tracking a video processing task through multiple statuses: queued → downloading → transcribing → analyzing → clipping → captioning → uploading → completed | error | cancelled
* Storing per-clip metadata: S3/Cloudinary URL, duration, start/end time, transcript segment, LLM score, LLM rationale
* Linking clips to the existing content pool with a content_type discriminator (photo vs video)
* Storing brand fonts (name, storage URL, default flag)
* Storing caption style templates (font size, color, outline, position, default flag)
* Tracking which clips have been published and their platform_post_id
Content type extension rule
The existing content pool table must gain a content_type column that defaults to 'photo' so that all existing rows remain valid without any data migration. Read the table definition first; only add what is missing.

Part 2 — Workflow and agent implementation
2.1 Pipeline state extension
Read the existing PipelineState definition first. Then add the minimum new fields required to route and track the video path. Do not rename or remove any existing field. Do not guess at the existing field names — read them.
New fields you will need (name them consistently with the existing convention you find):
* content_type — discriminates between "photo" and "video" pipeline paths
* A reference to the video source (type: URL or file upload, value: the URL or storage key)
* A reference to the video task record created in the database
* A list of clip IDs produced after processing
* References to the selected font and caption template
2.2 Orchestrator routing extension
Read the full existing routing function before touching it. Then add new branches at the top of the routing logic (before existing branches) so that:
* When content_type = "video" and the stage is init, route to the Video Clipper Agent
* When clips have been generated and review_enabled is true, route to the Human Review Gate
* When clips have been generated and review_enabled is false, route directly to Scheduling
All existing routing branches must remain untouched below your additions. Verify by tracing through a photo pipeline scenario after your changes — it must follow the same route as before.
2.3 Video Clipper Agent node — implementation workflow
Implement this as a single LangGraph node that orchestrates the following steps in sequence. Each step must:
* Update the task status in the database before starting work (so the UI shows current state)
* Emit a progress event via the existing Redis pub/sub channel before starting work
* Run all blocking I/O and CPU work (ffmpeg, file downloads, API calls) in a thread pool executor — never await a blocking call directly; use the pattern found in short-cut/
* Clean up temp files in a finally block so disk does not accumulate across tasks
Step 1 — Initialise task
* Create a video task record in the database with status queued
* Create an isolated temp working directory scoped to the task ID
* Write the task ID back to pipeline state
Step 2 — Acquire source video
* If source is a URL: download using yt-dlp. Read short-cut/ for the exact invocation options — format selection, output template, and how retries are handled
* If source is a file upload: download from Cloudinary using the stored URL
* Update status to downloading before starting; update to next status on completion
Step 3 — Transcribe
* Call the transcription service (AssemblyAI or equivalent configured in env) with the local video file path
* Request word-level timestamps — this is required for accurate caption alignment
* Parse the response into a list of { word, start_ms, end_ms } objects
* Update status to transcribing
Step 4 — LLM segment selection
* Update status to analyzing
* Build a prompt that provides:
    * The full transcript as a readable string with timestamps
    * The current strategy object from pipeline state (tone, style, brand voice, target audience) — this gives the LLM context for what makes a good clip for this brand
    * An instruction to return a JSON array of segments, each with start_ms, end_ms, score (0–10), and rationale
    * Constraints: each clip must be 30–90 seconds; clips must not overlap; the first 3 seconds of each clip must contain a strong hook; return at most N clips (configurable, default 5)
* Use the OpenAI client that already exists in the AI engine — do not instantiate a new one
* Validate the JSON response against the transcript timestamps; discard any segment whose times fall outside the transcript range
Step 5 — Cut clips with ffmpeg
* Update status to clipping
* For each segment from Step 4, invoke ffmpeg to cut the clip from the source video
* Output format: mp4, h264 video, aac audio
* If the source aspect ratio is not 9:16, apply ffmpeg scale and crop filters to reframe to 1080×1920 (TikTok portrait) — read short-cut/ for the exact filter chain
* Name each output file with its clip index inside the task temp directory
* All ffmpeg calls run in a thread pool executor
Step 6 — Generate captions and burn them
* Download the brand font file from Cloudinary to the temp directory; cache it so a single font file is only downloaded once per task even if used on multiple clips
* For each clip, generate a subtitle file (ASS or SRT format) from the word-level timestamps covering that clip's time window — read short-cut/ for the exact generation logic
* Use ffmpeg subtitles filter to hard-burn the captions with the configured style (font size, color, outline width, vertical position) from the selected caption template
* Update status to captioning
Step 7 — Upload clips to Cloudinary
* Update status to uploading
* Upload each captioned clip file to Cloudinary under a path namespaced by user ID and task ID
* Store the returned Cloudinary URL (or secure URL) for each clip
* Design the upload call behind a storage abstraction function (see Part 3 — Storage layer) so that swapping to S3 later only requires changing the implementation of that function
Step 8 — Persist to database
* For each clip, create a clip record in the database with all metadata (storage URL, duration, start/end time, transcript segment, LLM score, rationale, status draft)
* Create a content pool entry linking to the clip with content_type = 'video' and status draft
* Update the video task status to completed
* Write the list of clip IDs back to pipeline state
* Set current_stage to the value that routes correctly in the Orchestrator (Step 2.2)
Step 9 — Cleanup
* In a finally block, delete the entire temp working directory for this task
* This must execute even if any earlier step raised an exception
Error handling rule: if any step raises, update the task status to error with the exception message, emit an error event via the existing WebSocket channel, then re-raise so the Orchestrator can handle it. Do not swallow exceptions.
2.4 Auto Publish extension
Read the existing auto_publish_node fully before modifying it. Add a branch for content_type = "video" that:
* Calls TikTok Content Posting API with media_type: VIDEO and the Cloudinary URL as the pull source
* Applies the same retry logic already implemented for photo posts — read it and reuse it
* Stores the returned platform_post_id in the clip record
* Updates clip status to published
The existing photo branch must remain byte-for-byte identical.

Part 3 — Backend API (NestJS)
Read one complete existing NestJS module before implementing. Your new module must follow the same file structure, naming conventions, DTO validation approach, and repository pattern.
New endpoints to implement
Video task management
* POST /api/video-tasks — accepts source type and URL or upload reference; creates a task record; returns the task ID and initial status
* GET /api/video-tasks/:taskId — returns task status and associated clip metadata
* POST /api/video-tasks/:taskId/trigger-pipeline — enqueues a new pipeline run with content_type = "video"; returns the pipeline run ID
Clip review
* PATCH /api/video-clips/:clipId/review — accepts approved or rejected with optional feedback text; updates clip status; when all clips for a pipeline run are reviewed, emits a WebSocket event to resume the pipeline (read how the photo review gate does this and reuse the same mechanism)
Font and caption template management
* GET /api/fonts — returns all available brand fonts
* POST /api/fonts — accepts a font file upload; stores in Cloudinary; creates a font record
* GET /api/caption-templates — returns all caption style templates
* POST /api/caption-templates — creates a new caption style record
File upload
* Check whether POST /api/media/upload already exists. If it does, extend it to accept video files. If it does not, create it. Max accepted file size: 500 MB. Store in Cloudinary using the storage abstraction. Return the storage URL and public ID.
WebSocket events
Do not create a new gateway. Extend the existing one with these event names:
video:progress   { taskId, stage, percentComplete }
video:completed  { taskId, clipCount }
video:error      { taskId, message }
The AI engine worker publishes to the existing Redis pub/sub channel; the NestJS gateway subscribes and emits to the correct WebSocket room. Read how existing pipeline events flow and replicate the pattern exactly.

Part 4 — Frontend (Next.js)
5.1 Port the video clipping UI from short-cut/
Read the short-cut/ frontend thoroughly. Port the following screens into the existing Next.js dashboard as a new page at /video-clipper:
Task creation view (port from short-cut/, adapt to dashboard shell):
* Tab switcher: "YouTube / public URL" (text input with validation) vs "File upload" (drag-and-drop area, accepts video files, shows upload progress bar)
* Settings panel: font selector (populated from GET /api/fonts), caption template selector (GET /api/caption-templates), max clips control (slider or number input, range 1–10)
* Submit button that calls POST /api/video-tasks then POST /api/video-tasks/:id/trigger-pipeline
Progress view (port from short-cut/, adapt to dashboard shell):
* Stage-by-stage progress indicator driven by video:progress WebSocket events
* Show current stage name and percent complete
* Error state with message display
* Keep the exact UX flow from short-cut/ — do not simplify it
Clip review grid (port from short-cut/, adapt to dashboard shell):
* One card per clip, containing an inline video player with playback controls
* Clip metadata displayed: duration, LLM score, rationale
* Per-clip Approve / Reject buttons calling PATCH /api/video-clips/:clipId/review
* Keep the video player behaviour exactly as implemented in short-cut/
Adaptation rules when porting UI:
* Replace short-cut/'s auth/session handling with the existing dashboard's auth context
* Replace any standalone API client with the existing dashboard's API client / fetch wrapper
* Replace short-cut/'s component library imports with the existing dashboard's component library where components are equivalent — keep short-cut/'s component only where no equivalent exists
* Replace SSE (if short-cut/ uses SSE for progress) with WebSocket if the existing dashboard already uses WebSocket for pipeline events — use whichever real-time transport is already established
* Keep all layout, spacing, and interaction behaviour identical to short-cut/
5.2 Extend the existing Content Review panel
In the existing Human Review panel in the dashboard:
* Detect content_type === 'video' on the content item
* Render an inline <video> player with the clip URL instead of a <img> thumbnail
* The approve/reject action buttons require no change — they already call the same endpoint
5.3 Extend the Analytics panel
Add a Video tab (or section) alongside the existing photo analytics. Metrics: views, watch time, completion rate, shares. Source these from clip records that have a platform_post_id.

Part 6 — Worker
Queue architecture
Read the existing queue setup before implementing. The video processing jobs must run in a dedicated worker process — not in the FastAPI request handler and not in the main LangGraph executor. Use the same queue infrastructure already in place; add a new queue named video-processing.
The LangGraph video_clipper_node enqueues a job to video-processing and polls the database task record for status changes (check every 5 seconds, time out after 30 minutes). This keeps LangGraph's state machine intact while heavy processing runs out-of-process.
Blocking operations rule
Read short-cut/backend/src/utils/async_helpers.py (or equivalent) for the exact pattern. Apply it to every ffmpeg call, file I/O operation, and synchronous SDK call. Never await a blocking operation directly.
ffmpeg availability
Add ffmpeg to the Dockerfile of the worker service. Verify it is the version that supports the filter chains used for 9:16 reframing and subtitle burning.

Part 7 — Implementation rules
Rules you must follow
1. Read before you write. Every decision must be grounded in the existing codebase.
2. Do not modify any existing LangGraph node other than the Orchestrator (routing extension) and Auto Publish (video branch addition).
3. The photo pipeline must be completely unaffected. After your changes, trace through a full photo pipeline scenario and confirm every route and state transition is identical.
4. Write database migrations that are safe to run against a live database — non-destructive, IF NOT EXISTS, no column renames, defaults that preserve existing rows.
5. Update task status in the database before starting each step, not after completing it.
6. Use the existing OpenAI client for LLM calls — do not create a new one.
7. All S3/Cloudinary keys and paths must be namespaced by user_id — no cross-user access.
8. The Human Review Gate is shared between photo and video — do not create a new gate; only extend the Dashboard UI to show a video player instead of an image.
9. The storage abstraction must be the only place that references Cloudinary. Nothing else in the codebase should import the Cloudinary SDK directly.
10. All new endpoints must be protected by the existing auth middleware — read how existing endpoints apply it and apply it the same way.
Things you must not do
* Do not create a separate microservice or Docker container for video processing
* Do not store video binary data in the database — storage URLs only
* Do not expose ffmpeg commands through any API endpoint
* Do not change the review_enabled toggle behaviour — it applies equally to photo and video
* Do not add a new WebSocket gateway — extend the existing one
* Do not hardcode Cloudinary credentials, paths, or any configuration value in application code
* Do not copy short-cut/'s auth, billing, or admin logic into the system

Acceptance criteria
Before considering the feature complete, verify each of the following manually:
* Submitting a YouTube URL creates a task record and triggers the pipeline
* The Dashboard progress view updates in real time through all processing stages
* After processing completes, the clip review grid shows playable video cards
* Approving clips resumes the pipeline and proceeds to Scheduling
* The Scheduler produces a schedule entry for each approved clip
* Auto Publish calls TikTok API with media_type: VIDEO and the correct clip URL
* platform_post_id is stored in the clip record after successful publish
* Rejecting a clip marks it rejected; if all clips are rejected, the pipeline re-enters Content Generation (or re-clips) based on the feedback — confirm this with the team
* A full photo pipeline run completes without any change in behaviour
* Cancelling a task mid-processing sets status to cancelled and stops the worker job
* Uploading a file larger than 500 MB returns an appropriate error
* Temp directories are absent after every completed or failed task