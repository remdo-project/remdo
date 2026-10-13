import errno

import markdown
import yaml
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.http import Http404
from django.shortcuts import render
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_safe

SLUG_PATTERN = r"[a-z0-9]+(?:-[a-z0-9]+)*"


def is_text(value):
    return isinstance(value, str) and bool(value.strip())


def read_page(path, fields):
    """Return the front matter and Markdown body of a repository page.

    `fields` maps each front-matter key to a predicate its value must satisfy.
    """
    lines = path.read_text(encoding="utf-8").splitlines()
    try:
        if not lines or lines[0] != "---":
            raise ValueError("Expected YAML front matter between --- lines")
        end = lines.index("---", 1)
        metadata = yaml.safe_load("\n".join(lines[1:end]))
        if not isinstance(metadata, dict):
            raise ValueError("Front matter must be a mapping")
        for key, is_valid in fields.items():
            if not is_valid(metadata.get(key)):
                raise ValueError(f"{key} is missing or invalid")
    except (ValueError, yaml.YAMLError) as error:
        raise ImproperlyConfigured(
            f"Invalid public page {path.parent.name}/{path.name}: {error}"
        ) from error
    return metadata, "\n".join(lines[end + 1 :])


@never_cache
@require_safe
def public_page(request, slug):
    try:
        metadata, body = read_page(
            settings.PUBLIC_PAGES_DIR / f"{slug}.md", {"title": is_text, "description": is_text}
        )
    except OSError as error:
        if error.errno not in (errno.ENOENT, errno.ENAMETOOLONG):
            raise
        raise Http404 from error
    return render(
        request,
        "pages/page.html",
        {
            "title": metadata["title"],
            "description": metadata["description"],
            "canonical": f"{settings.APP_ORIGIN}/{slug}/",
            # Page sources are trusted, reviewed repository content, like templates.
            "body": markdown.markdown(body),
        },
    )
