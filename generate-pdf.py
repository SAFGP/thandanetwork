import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # 16:9 at 1920x1080
        await page.set_viewport_size({"width": 1920, "height": 1080})

        # Load from local server
        await page.goto("http://localhost:8888/index.html", wait_until="networkidle", timeout=30000)

        # Wait for fonts and images
        await page.wait_for_timeout(4000)

        # Force all reveals visible with inline styles (no animation in PDF)
        await page.evaluate("""
            document.querySelectorAll('.rv').forEach(el => {
                el.style.opacity = '1';
                el.style.transform = 'none';
            });
            // Hide the red line for PDF
            const rl = document.querySelector('.rl');
            if (rl) rl.style.display = 'none';
        """)

        await page.wait_for_timeout(500)

        # Add PDF print styles - 16:9 landscape, each .pg section = 1 page
        await page.evaluate("""
            const style = document.createElement('style');
            style.textContent = `
                @page { size: 1920px 1080px; margin: 0; }
                @media print {
                    html, body { width: 1920px; height: auto; }
                    .pg {
                        width: 1920px; height: 1080px;
                        min-height: 1080px; max-height: 1080px;
                        page-break-after: always;
                        page-break-inside: avoid;
                        overflow: hidden;
                        padding: 80px 120px;
                        align-items: center;
                    }
                    .pg.np { padding: 0; }

                    /* Bigger fonts for PDF readability */
                    .bd { font-size: 18px; max-width: 800px; }
                    .lbl, .sn { font-size: 11px; letter-spacing: 3.5px; }
                    .t2 { font-size: 56px; }
                    .st-n { font-size: 52px; }
                    .st-lb { font-size: 11px; }
                    .st-d { font-size: 14px; }
                    .t1 { font-size: 88px; }
                    .sub { font-size: 22px; }

                    /* Tables bigger */
                    .tb { max-width: 100%; }
                    .tb thead th { font-size: 12px; padding: 16px 0; }
                    .tb td { font-size: 17px; padding: 14px 24px 14px 0; }

                    /* Timeline bigger */
                    .tl { max-width: 800px; }

                    /* Stat row wider */
                    .sts { max-width: 100%; }

                    /* Footer */
                    .ft {
                        position: fixed; bottom: 0; left: 0; right: 0;
                        font-size: 12px; padding: 20px;
                    }

                    /* Hide scrollbar artifacts */
                    ::-webkit-scrollbar { display: none; }
                }
            `;
            document.head.appendChild(style);
        """)

        await page.wait_for_timeout(500)

        sections = await page.evaluate('document.querySelectorAll(".pg").length')
        print(f"Found {sections} pages")

        await page.pdf(
            path="/Users/cameronkernahan/Downloads/Claude Skills/thanda-deploy/Thanda_Royal_Residence_Sales_Action_Plan.pdf",
            width="1920px",
            height="1080px",
            print_background=True,
            prefer_css_page_size=True
        )

        await browser.close()
        print("PDF generated successfully!")

asyncio.run(main())
