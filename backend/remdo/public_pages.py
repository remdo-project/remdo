import markdown
import yaml
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.http import Http404
from django.shortcuts import render
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_safe


@never_cache
@require_safe
def public_page(request, slug):
    try:
        source = (settings.PUBLIC_PAGES_DIR / f"{slug}.md").read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise Http404 from error

    lines = source.splitlines()
    try:
        if not lines or lines[0] != "---":
            raise ValueError("Expected YAML front matter between --- lines")
        end = lines.index("---", 1)
        metadata = yaml.safe_load("\n".join(lines[1:end]))
        if not isinstance(metadata, dict) or any(
            not isinstance(metadata.get(key), str) or not metadata[key].strip()
            for key in ("title", "description")
        ):
            raise ValueError("title and description must be non-empty strings")
    except (ValueError, yaml.YAMLError) as error:
        raise ImproperlyConfigured(f"Invalid public page {slug}.md: {error}") from error

    return render(
        request,
        "pages/page.html",
        {
            "title": metadata["title"],
            "description": metadata["description"],
            "canonical": f"{settings.APP_ORIGIN}/{slug}/",
            # Page sources are trusted, reviewed repository content, like templates.
            "body": markdown.markdown("\n".join(lines[end + 1 :])),
        },
    )
