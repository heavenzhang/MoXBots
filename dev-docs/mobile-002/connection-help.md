# Mobile connection help checkpoint

The actual complete connection test confirmed that a newly published Bot mount
is disabled until its original explicit network authorization. The app's empty
catalog state now links directly to connection help: use the same account on
phone and Host, open the corresponding device in desktop Bots Network, enable
the intended Bot, then return and refresh. No mobile permission API, automatic
mount grant, or network membership mutation is added.

New-session is disabled when there is no selected Bot. A confirmed signed-in
account now leaves the login screen before directory loading; a directory read
failure remains an actionable connection error on the session screen.

Primary explicit web QA exercised no-bots → connection help → original session
list and the network-error state. The no-bots fixture returns a genuinely empty
synthetic directory rather than using a failed read as its substitute; its type
is shared with the existing fixture port. The visible brown fixture banner is
retained. App typecheck, lint and existing50 policy tests passed.

Screenshot: task external output `ui-checkpoints/connection-help-20261018.png`.
Actual browser viewport1280×720 with a480px app column. This is small UI behavior
and visual evidence, not native keyboard/insets,390/360, real network grants or
phone acceptance. Existing accepted compact chat layout is unchanged.
