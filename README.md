# horix-erp

Modular ERP with independent micro-frontends.

| Module | Repo | Tech |
|--------|------|------|
| Launcher | [horix-launcher](https://github.com/Kernel-Panic92/horix-launcher) | Express, SQLite |
| Horix API | [horix-api](https://github.com/Kernel-Panic92/horix-api) | Express, SQLite |
| DocFlow API | [docflow-api](https://github.com/Kernel-Panic92/docflow-api) | Express, PostgreSQL |

## Quick Start

```bash
git clone --recurse-submodules https://github.com/Kernel-Panic92/horix-erp.git
cd horix-erp
sudo bash install.sh test
```

## Update

```bash
git pull --recurse-submodules
git submodule update --remote
# Then re-copy files to /opt/horix-platform and restart PM2
```
