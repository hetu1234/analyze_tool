import akshare as ak
import pandas as pd

def getAllStockCodes():
    # 获取所有A股股票代码和名称 [code, name]
    df = ak.stock_info_a_code_name()
    print(f"共获取 {len(df)} 只 A 股股票")
    return df

def getStockDividendData():
    allStockCodes = getAllStockCodes()
    
    # 用于收集所有股票的分红数据
    all_dividend_data = []
    # 用于收集无分红数据的股票
    no_dividend_stocks = []
    # 用于收集数据获取失败的股票
    error_stocks = []
    
    success_count = 0
    
    for index, row in allStockCodes[:10].iterrows():  # 先测试前10个
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
                print(f"股票 {stockCode}({stockName}) 有 {len(df)} 条分红记录")
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

# df = ak.stock_dividend_cninfo()
# print(df.head())
# 只保留已实施的分红（避免预案干扰）
# df = df[df['dividend_progress'] == '实施']

# # 统计每只股票分红年份数量
# dividend_counts = df.groupby('symbol')['dividend_year'].nunique().reset_index()
# dividend_counts.columns = ['symbol', 'years_dividend']

# # 找出连续5年以上分红的股票
# high_dividend_stocks = dividend_counts[dividend_counts['years_dividend'] >= 5]
# print(high_dividend_stocks)

if __name__ == "__main__":
    getStockDividendData()