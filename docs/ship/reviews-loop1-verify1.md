Reviewed `19804fa..c474c53`.

1. **FIXED**: div-only, `<br>` and nested-list text survives; `lib/productDescription.ts:110`.
2. **FIXED**: nonempty HTML uses the parser result without restoring plain text; `app/product/[handle].tsx:34`.
3. **NOT FIXED**: two-column `<td>` headers, including inside `<thead>`, still render `Store price (SGD)` and `18.90`; header detection requires three columns or `<th>` (`lib/productDescription.ts:63`).
4. **FIXED**: plural SKUs and internal `Label: value` lines are filtered; `lib/productDescription.ts:20`, `:47`, `:84`.
5. **FIXED**: Home sends a fresh focus parameter, triggering refocus on the mounted input; `app/(tabs)/index.tsx:69`, `app/(tabs)/shop.tsx:34`.
6. **FIXED**: subtitle uses opaque `onPrimary`, measuring 5.28:1 light / 8.96:1 dark; `app/tools/export.tsx:95`.
7. **FIXED**: NEW uses white on `#8A5A00`, measuring 5.93:1 in both modes; `components/ReelCard.tsx:20`.
8. **FIXED**: tier text on neutral fill measures at least 5.24:1 light / 6.70:1 dark; `app/(tabs)/index.tsx:157`.
9. **FIXED**: unchecked outline measures 3.70:1 light / 4.61:1 dark; `components/clinical.tsx:178`.

Two **new P1s** reproduced with synthetic inputs:

- **Lost customer warning**: `<div id="ai-summary"><p>Use on intact skin.</p><p>Store price: S$12.</p></div>` returns `[]`. Summary paragraphs are combined before filtering, removing the warning alongside the price; `lib/productDescription.ts:103`.
- **Lost information and invented associations**: headerless rows `Small | White | Single pack` and `Large | Blue | Two packs` become only `Large = White: Blue · Single pack: Two packs`. The first data row is mistaken for headers; `lib/productDescription.ts:63`.

Validation: 14 offline parser assertions passed; `python3 tools/contrast.py` passed 50/50; typecheck passed. The full parser command stopped on Shopify DNS failure. Lint could not run because ESLint setup is absent and installation is blocked by the read-only sandbox.

**FAIL**

