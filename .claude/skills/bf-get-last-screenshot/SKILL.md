---
name: bf-get-last-screenshot
description: Find and return the file path of the most recent screenshot. Use when the user says "last screenshot", "latest screenshot", "get screenshot", "find screenshot", "screenshot path", or wants to reference their most recent screen capture.
allowed-tools: Bash, Read, Write, Edit, Glob, mcp__customTools__ask_user
---

# Get Last Screenshot

Returns the full file path of the most recently taken screenshot from the user's configured screenshots folder.

## Quick Start

```
/bf-get-last-screenshot
```

## Instructions

### Step 1: Determine Screenshots Folder

Check if the user has a saved screenshots folder path in the project's `CLAUDE.md` file.

1. **Check CLAUDE.md for saved path**:
   - Read `CLAUDE.md` at the project root (if it exists)
   - Look for a line matching: `screenshots-folder: <path>`
   - If found, use that path and skip to Step 2

2. **If no saved path exists, onboard the user**:
   - Use mcp__customTools__ask_user to ask:

   **Question**: "Where are your screenshots saved? Please provide the full folder path."
   **Header**: "Screenshots"
   **Options**:
   - **"Desktop"** - `~/Desktop` (or `C:\Users\<user>\Desktop` on Windows)
   - **"Pictures/Screenshots"** - `~/Pictures/Screenshots` (or `C:\Users\<user>\Pictures\Screenshots` on Windows)
   - **"Downloads"** - `~/Downloads` (or `C:\Users\<user>\Downloads` on Windows)

   The user can also select "Other" to provide a custom path.

3. **Resolve the path**:
   - Expand `~` to the full home directory path
   - On Windows, convert forward slashes to backslashes
   - Verify the folder exists using Bash: `ls "<path>"` (or `dir "<path>"` on Windows)
   - If the folder does not exist, inform the user and ask again

4. **Save the path to CLAUDE.md**:
   - If `CLAUDE.md` exists, append the screenshots folder config
   - If `CLAUDE.md` does not exist, create it
   - Add the line: `screenshots-folder: <full-path>`
   - This ensures future runs skip the onboarding step

### Step 2: Find the Most Recent Screenshot

1. **List files in the screenshots folder** sorted by modification time (newest first):

   **On Windows**:
   ```powershell
   powershell -Command "Get-ChildItem '<path>' -File | Where-Object { $_.Extension -match '\.(png|jpg|jpeg|gif|bmp|webp|tiff)$' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { $_.FullName }"
   ```

   **On macOS/Linux**:
   ```bash
   ls -t "<path>"/*.{png,jpg,jpeg,gif,bmp,webp,tiff} 2>/dev/null | head -1
   ```

2. **Handle edge cases**:
   - If the folder is empty or has no image files, inform the user: "No screenshots found in `<path>`."
   - If permission is denied, inform the user and suggest checking folder permissions

### Step 3: Return the Result

1. **Output the file path** clearly:
   ```
   Last screenshot: <full-file-path>
   ```

2. **Include metadata** (modification time and file size):
   ```
   Last screenshot: <full-file-path>
   Taken: <date and time>
   Size: <file size>
   ```

3. **Read the screenshot** using the Read tool to display it to the user (Read tool supports viewing images).

## Notes

- The screenshots folder path is saved to `CLAUDE.md` so the user only needs to configure it once per project
- Supports common image formats: PNG, JPG, JPEG, GIF, BMP, WebP, TIFF
- Works on Windows, macOS, and Linux
- If the user wants to change their screenshots folder, they can edit the `screenshots-folder` line in `CLAUDE.md` or delete it to trigger onboarding again
