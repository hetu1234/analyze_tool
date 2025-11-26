import akshare as ak
import pandas as pd
import time
from datetime import datetime

def getAllStockCodes(containBJ = True):
    # 获取所有A股股票代码和名称 [code, name]
    df = ak.stock_info_a_code_name()
    print(f"共获取 {len(df)} 只 A 股股票")
    if not containBJ:
        # 沪深A股：6开头（沪市）、0/3开头（深市）
        df = df[df['code'].str.match(r'^(60|68|00|30)\d{4}$')].reset_index(drop=True)
    return df

def getNewStockPrice():
    # 2. 获取最新股价（用于计算股息率）
    print("正在获取最新股价...")
    price_df = ak.stock_zh_a_spot_em()
    price_map = dict(zip(price_df['代码'], price_df['最新价']))
    return price_map

def getStockDividendData():
    allStockCodes = getAllStockCodes()
    
    # 用于收集所有股票的分红数据
    all_dividend_data = []
    # 用于收集无分红数据的股票
    no_dividend_stocks = []
    # 用于收集数据获取失败的股票
    error_stocks = []
    
    success_count = 0
    
    for index, row in allStockCodes.iterrows():  # 先测试前10个
        stockCode = row['code']
        stockName = row['name']
        try:
            df = ak.stock_dividend_cninfo(stockCode)
            if len(df) == 0:
                print(f"股票 {stockCode}({stockName}) 无分红数据")
                # 记录到无分红列表
                no_dividend_stocks.append({
                    '股票代码': stockCode,
                    '股票名称': stockName,
                    '备注': '无分红记录'
                })
            else:
                # print(f"股票 {stockCode}({stockName}) 有 {len(df)} 条分红记录")
                # 添加股票代码和名称列
                df.insert(0, '股票名称', stockName)
                df.insert(0, '股票代码', stockCode)
                # 添加到列表中
                all_dividend_data.append(df)
                success_count += 1
        except KeyError as e:
            print(f"股票 {stockCode}({stockName}) 数据格式错误: {e}")
            error_stocks.append({
                '股票代码': stockCode,
                '股票名称': stockName,
                '备注': f'数据格式错误: {e}'
            })
        except Exception as e:
            print(f"股票 {stockCode}({stockName}) 获取失败: {e}")
            error_stocks.append({
                '股票代码': stockCode,
                '股票名称': stockName,
                '备注': f'获取失败: {e}'
            })
    
    # 保存到 Excel（多个 sheet）
    output_file = "股票分红数据汇总.xlsx"
    with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
        # 第一张表：有分红数据的股票
        if len(all_dividend_data) > 0:
            final_df = pd.concat(all_dividend_data, ignore_index=True)
            final_df.to_excel(writer, sheet_name='分红数据', index=False)
            print(f"\n✓ 有分红数据的股票: {success_count} 只，共 {len(final_df)} 条分红记录")
        
        # 第二张表：无分红数据的股票
        if len(no_dividend_stocks) > 0:
            no_dividend_df = pd.DataFrame(no_dividend_stocks)
            no_dividend_df.to_excel(writer, sheet_name='无分红股票', index=False)
            print(f"✓ 无分红数据的股票: {len(no_dividend_stocks)} 只")
        
        # 第三张表：获取失败的股票
        if len(error_stocks) > 0:
            error_df = pd.DataFrame(error_stocks)
            error_df.to_excel(writer, sheet_name='获取失败', index=False)
            print(f"✓ 数据获取失败的股票: {len(error_stocks)} 只")
    
    print(f"\n数据已保存到 {output_file}")

def getHighDividend():
    stock_list = getAllStockCodes(False)
    price_map = getNewStockPrice()
    # 3. 筛选高分红股
    results = []

    for i, row in stock_list.iterrows():
        symbol = row['code']
        name = row['name']
        
        try:
            # 获取该股历史分红（实施方案）
            div_df = ak.stock_dividend_cninfo(symbol=symbol)
            
            if div_df.empty:
                continue  # 从未分红
            
            # 只保留“已实施”的分红（排除预案）
            div_df = div_df[div_df['分红类型'].str.contains('现金', na=False)]
            if div_df.empty:
                continue
            
            # 转换派息比例为每股分红（元）
            div_df['每股分红'] = div_df['派息比例'] / 10.0
            
            # 获取最近一次分红（按报告时间排序）
            div_df['报告时间'] = pd.to_datetime(div_df['报告时间'])
            latest_div = div_df.sort_values('报告时间', ascending=False).iloc[0]
            
            # 判断是否近3年有分红（以报告时间为准）
            current_year = datetime.now().year
            report_year = latest_div['报告时间'].year
            if report_year < current_year - 2:  # 不是近3年（2023,2024,2025）
                continue
            
            # 获取当前股价
            current_price = price_map.get(symbol, None)
            if current_price is None or current_price <= 0:
                continue
            
            # 计算股息率（税前）
            dividend_per_share = latest_div['每股分红']
            dividend_yield = dividend_per_share / current_price * 100  # 百分比
            
            # 筛选条件：股息率 > 3%
            if dividend_yield >= 3.0:
                results.append({
                    '代码': symbol,
                    '名称': name,
                    '最新价': round(current_price, 2),
                    '每股分红(元)': round(dividend_per_share, 2),
                    '派息比例(10派X)': latest_div['派息比例'],
                    '股息率(%)': round(dividend_yield, 2),
                    '分红年度': report_year,
                    '股权登记日': latest_div['股权登记日'],
                    '除权日': latest_div['除权日']
                })
        
        except Exception as e:
            # print(f"处理 {symbol} 出错: {e}")
            pass
        
        # 避免请求过快（巨潮有反爬）
        if i % 50 == 0:
            print(f"已处理 {i}/{len(stock_list)} 只股票...")
            time.sleep(1)

    # 4. 输出结果
    result_df = pd.DataFrame(results)
    if not result_df.empty:
        result_df = result_df.sort_values('股息率(%)', ascending=False)
        print("\n✅ 高股息率股票（近3年分红 & 股息率 ≥ 3%）:")
        print(result_df.head(20))  # 显示前20
        
        # 保存到 Excel
        result_df.to_excel("high_dividend_stocks.xlsx", index=False)
        print("\n已保存到 high_dividend_stocks.xlsx")
    else:
        print("未找到符合条件的股票")

if __name__ == "__main__":
    getStockDividendData()
    getHighDividend()