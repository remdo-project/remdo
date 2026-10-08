from dataclasses import dataclass

from allauth.account.adapter import DefaultAccountAdapter
from allauth.account.authentication import get_authentication_records
from allauth.account.utils import filter_users_by_email, get_next_redirect_url
from allauth.core import context
from allauth.core.exceptions import ImmediateHttpResponse
from allauth.headless.adapter import DefaultHeadlessAdapter
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.conf import settings
from django.shortcuts import render
from django.urls import reverse


def password_authenticated(request, user):
    records = get_authentication_records(request)
    if not records or records[-1]["method"] != "password":
        return False
    addresses = {user.email, *user.emailaddress_set.values_list("email", flat=True)}
    return records[-1].get("email", "").lower() in addresses


class AccountAdapter(DefaultAccountAdapter):
    def is_open_for_signup(self, request):
        return settings.EMAIL_SIGNUP_ENABLED

    # Control of a mailbox must not grant administration, as with Google. Every
    # login completes here whichever stage finishes it, so only the user's own
    # password authentication may complete an administrator's, and refusing
    # before the session exists leaves no sign-in trace. The flush drops the
    # pending stage that would otherwise capture the next attempt.
    def login(self, request, user):
        if user.is_administrator and not password_authenticated(request, user):
            request.session.flush()
            raise ImmediateHttpResponse(
                render(
                    request,
                    "account/password_only.html",
                    {"next": get_next_redirect_url(request)},
                )
            )
        super().login(request, user)

    # allauth's notice points to a password reset, which this app does not route.
    def send_account_already_exists_mail(self, email):
        login_url = context.request.build_absolute_uri(reverse("account_login"))
        self.send_mail("account/email/account_already_exists", email, {"login_url": login_url})


def verified_email(sociallogin):
    addresses = sociallogin.email_addresses
    if len(addresses) == 1 and addresses[0].verified:
        return addresses[0].email
    return None


class SocialAccountAdapter(DefaultSocialAccountAdapter):
    # Account emails are assigned by operators or verified by the provider or an
    # emailed code, so a verified match identifies the owner. allauth's own email
    # authentication would instead disable the password of accounts without a
    # verified EmailAddress row, which operator tooling can still leave behind. Staff accounts
    # never use Google, even when linked before a promotion: control of a Google
    # account must not grant administration.
    def pre_social_login(self, request, sociallogin):
        if sociallogin.is_existing:
            user = sociallogin.user
        elif email := verified_email(sociallogin):
            user = next(iter(filter_users_by_email(email)), None)
        else:
            return
        if user and user.is_administrator:
            raise ImmediateHttpResponse(render(request, "account/signup_closed.html"))
        if user and not sociallogin.is_existing:
            sociallogin.connect(request, user)

    # An unverified address could claim another person's email and receive
    # documents shared with it.
    def is_open_for_signup(self, request, sociallogin):
        return verified_email(sociallogin) is not None


class HeadlessAdapter(DefaultHeadlessAdapter):
    def get_user_dataclass(self):
        @dataclass
        class User(super().get_user_dataclass()):
            is_staff: bool = False

        return User

    def user_as_dataclass(self, user):
        data = super().user_as_dataclass(user)
        data.is_staff = user.is_staff
        return data
