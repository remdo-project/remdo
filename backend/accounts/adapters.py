from dataclasses import dataclass

from allauth.account.adapter import DefaultAccountAdapter
from allauth.account.utils import filter_users_by_email
from allauth.core.exceptions import ImmediateHttpResponse
from allauth.headless.adapter import DefaultHeadlessAdapter
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.shortcuts import render


class AccountAdapter(DefaultAccountAdapter):
    def is_open_for_signup(self, request):
        return False


def verified_email(sociallogin):
    addresses = sociallogin.email_addresses
    if len(addresses) == 1 and addresses[0].verified:
        return addresses[0].email
    return None


class SocialAccountAdapter(DefaultSocialAccountAdapter):
    # Account emails are assigned by operators or verified by the provider, so a
    # verified match identifies the owner. allauth's own email authentication
    # would instead disable the password of accounts without a verified
    # EmailAddress row, which operator-created accounts lack. Staff accounts
    # never use Google, even when linked before a promotion: control of a Google
    # account must not grant administration.
    def pre_social_login(self, request, sociallogin):
        if sociallogin.is_existing:
            user = sociallogin.user
        elif email := verified_email(sociallogin):
            user = next(iter(filter_users_by_email(email)), None)
        else:
            return
        if user and (user.is_staff or user.is_superuser):
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
