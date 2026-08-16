# Vendored SVGL logos

Every `.svg` in this folder is an unmodified copy of the matching asset from the
[SVGL](https://svgl.app) library ([source repository](https://github.com/pheralb/svgl),
`static/library/`). They are vendored so the agent timeline renders real brand
marks without a runtime dependency on svgl.app.

Filenames are kept exactly as SVGL publishes them, including the `_dark` /
`-dark` suffixes, which are the variants intended for dark backgrounds. To
refresh an asset, re-download it by name:

```sh
curl -sL "https://raw.githubusercontent.com/pheralb/svgl/main/static/library/<name>.svg" \
  -o "public/svgl/<name>.svg"
```

Consumers:

- `components/icons/instance-type-icon.tsx` — operating system / instance marks.
- `components/icons/file-type-badge.tsx` — language marks for file chips.

Each logo remains the trademark of its respective owner and is used here only to
identify the corresponding technology.

## No distro marks in SVGL

SVGL ships `ubuntu`, `linux`, `windows`, `apple`, `raspberry_pi` and `docker`,
but no AlmaLinux, Debian, Rocky, CentOS, RHEL, Fedora, Alpine, Arch or openSUSE
marks. Those instance types fall back to the generic Tux (`linux.svg`) and are
flagged with `usesGenericMark` in the instance type registry.
