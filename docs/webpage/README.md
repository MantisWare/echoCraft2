# EchoCraft product website

Standalone marketing pages for [https://www.mantisware.co.za/echoCraft/](https://www.mantisware.co.za/echoCraft/).

`./upload.sh` (and `upload.ps1`) deploys this folder over FTP (`SFTP_*` / `FTP_*` in `.env.upload`) after any platform binaries. A website-only run still publishes when `dist/` has no complete platform. `SFTP_PATH` must be `/echoCraft`.

Uploaded files: HTML, CSS, SVG, and bundled fonts. `README.md` stays local.
