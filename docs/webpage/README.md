# EchoCraft product website

Standalone marketing pages for [https://www.mantisware.co.za/echoCraft/](https://www.mantisware.co.za/echoCraft/).

`./upload-web.sh` (and `upload-web.ps1`) publishes only this folder over FTP (`SFTP_*` / `FTP_*` in `.env.upload`). `./upload.sh` does the same after any platform binaries. `SFTP_PATH` must be `/echoCraft`.

Uploaded files: HTML, CSS, SVG, and bundled fonts. `README.md` stays local.
