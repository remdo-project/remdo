- **Editor showcase**
    - id:: showcaseTitle
- Plain **bold** *italic* <u>underline</u> ~~strike~~ `code` ***bold italic***
    - id:: inlineFormatting
- Due [Jul 9, 2026](date:2026-07-09) see [done task](note:checkDone) and [remote note](note:otherDoc_remoteNote)
    - id:: dateAndLinks
- [x] Note with body
    > Body has **rich text** and a [note link](note:checkDone)
    > Second body line
    > Third body line
    - id:: bodyNote
- Folded parent
    - id:: foldedParent
    - folded:: true
    - Hidden child
        - id:: foldedChild
- Numbered steps
    - id:: numberedParent
    1. First step
        - id:: stepOne
    2. Second step
        > Second step body
        - id:: stepTwo
- Checklist
    - id:: checklistParent
    - [x] Done task
        > Done task body
        - id:: checkDone
    - [ ] Open task
        - id:: checkOpen
